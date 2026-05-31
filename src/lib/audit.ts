import { createPendingAudit, updateAudit } from './db';
import { getSettings, getApiKey } from './settings';
import { analyzeScript } from './llm';
import type { AuditSummary } from './db';

/**
 * 审计编排核心逻辑。
 *
 * 这段流程原先内联在 src/app/api/audit/route.ts 的 POST handler 中。
 * 抽取到 lib 后，被 Web API route 和 MCP server 共用，保证两条入口
 * 行为永远一致（单一数据源）。
 *
 * ⚠️ 关键：本文件所有日志必须走 console.error（stderr）。
 * MCP stdio server 用 stdout 作 JSON-RPC 协议通道，任何 stdout 写入
 * 都会破坏协议、导致工具调用失败。Next.js 进程里 stderr 同样可见。
 *
 * 数据流：
 *   url ──▶ fetch ──▶ createPendingAudit ──▶ analyzeScript ──▶ updateAudit
 *            │              │                     │                │
 *            ▼              ▼                     ▼                ▼
 *         超时/非200     入库 pending         LLM 超时/401      落库 complete
 *         FETCH_ERROR                         LLM_ERROR/TIMEOUT  或 error
 */

export type AuditErrorCode = 'FETCH_ERROR' | 'LLM_ERROR' | 'PARSE_ERROR' | 'TIMEOUT';

export type AuditResult =
  | {
      ok: true;
      id: number;
      summary: AuditSummary;
      translatedScript: string;
      truncated: boolean;
    }
  | {
      ok: false;
      id?: number;
      code: AuditErrorCode;
      error: string;
    };

// 从 URL 提取文件名（与原 route.ts extractFilename 行为一致）
export function extractFilename(url: string): { filename: string; filenameDisplay: string } {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const filename = pathParts[pathParts.length - 1] || 'script';
    const filenameDisplay = filename.replace(/\.[^/.]+$/, ''); // 去掉扩展名
    return { filename, filenameDisplay };
  } catch {
    return { filename: 'script', filenameDisplay: 'script' };
  }
}

/**
 * 下载远程脚本并审计。供 audit_script 工具和 Web /api/audit route 使用。
 */
export async function runAudit(url: string): Promise<AuditResult> {
  // 下载脚本内容
  let scriptContent: string;
  console.error('[审计] 开始下载:', url);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return { ok: false, code: 'FETCH_ERROR', error: `无法下载脚本 (${response.status})` };
    }
    scriptContent = await response.text();
    console.error('[审计] 下载完成，脚本行数:', scriptContent.split('\n').length);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return { ok: false, code: 'FETCH_ERROR', error: '下载超时，请检查 URL 是否可访问' };
    }
    return { ok: false, code: 'FETCH_ERROR', error: '下载失败，请检查 URL 是否有效' };
  }

  const { filename, filenameDisplay } = extractFilename(url);
  return auditContent(url, filename, filenameDisplay, scriptContent);
}

/**
 * 审计已获取的脚本内容（不下载）。供 audit_local_file 工具使用。
 *
 * @param sourceUri 落库的 url 字段，本地文件传 file:///absolute/path
 * @param filename  原始文件名（含扩展名）
 * @param content   脚本内容（调用方负责以 UTF-8 读取）
 */
export async function runAuditOnContent(
  sourceUri: string,
  filename: string,
  content: string
): Promise<AuditResult> {
  const filenameDisplay = filename.replace(/\.[^/.]+$/, '');
  return auditContent(sourceUri, filename, filenameDisplay, content);
}

/**
 * 共享核心：建 pending 记录 → 读配置 → 调 LLM → 落库。
 * runAudit 和 runAuditOnContent 都走这里，确保 LLM 调用和错误映射唯一。
 */
async function auditContent(
  url: string,
  filename: string,
  filenameDisplay: string,
  scriptContent: string
): Promise<AuditResult> {
  // 先建 pending 记录（与 LLM 调用解耦，失败也有痕迹）
  const auditId = createPendingAudit(url, filename, filenameDisplay, scriptContent);

  const settings = getSettings();
  const apiKey = await getApiKey();

  if (!settings.apiUrl || !apiKey) {
    updateAudit(auditId, { error: 'API 未配置' });
    return {
      ok: false,
      id: auditId,
      code: 'LLM_ERROR',
      error: '请先在设置页配置 LLM API（启动 Web 应用并访问 http://localhost:3000/settings）',
    };
  }

  console.error('[审计] 开始分析...');
  try {
    const result = await analyzeScript(scriptContent, {
      apiUrl: settings.apiUrl,
      apiKey,
      model: settings.model,
      maxLines: settings.maxLines,
      headLines: settings.headLines,
      tailLines: settings.tailLines,
    });

    updateAudit(auditId, {
      translatedContent: result.translatedScript,
      riskLevel: result.summary.risk_level,
      networkOps: result.summary.network_ops,
      gitOps: result.summary.git_ops,
      telemetry: result.summary.telemetry,
      dangerousPatterns: result.summary.dangerous_patterns,
      risks: result.summary.risks,
      advice: result.summary.advice,
      truncated: result.truncated,
    });

    console.error('[审计] 分析完成，风险等级:', result.summary.risk_level);

    return {
      ok: true,
      id: auditId,
      summary: result.summary,
      translatedScript: result.translatedScript,
      truncated: result.truncated,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';

    if (error.includes('timeout') || error.includes('TimeoutError')) {
      updateAudit(auditId, { error: 'LLM 响应超时' });
      return { ok: false, id: auditId, code: 'TIMEOUT', error: 'LLM 响应超时，请重试' };
    }

    if (error.includes('401') || error.includes('403') || error.includes('API')) {
      updateAudit(auditId, { error: 'LLM API 错误' });
      return { ok: false, id: auditId, code: 'LLM_ERROR', error: `LLM API 错误: ${error}` };
    }

    updateAudit(auditId, { error: '解析失败' });
    return { ok: false, id: auditId, code: 'PARSE_ERROR', error: `处理失败: ${error}` };
  }
}
