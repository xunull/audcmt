import { NextRequest, NextResponse } from 'next/server';
import { createPendingAudit, updateAudit } from '@/lib/db';
import { getSettings, getApiKey } from '@/lib/settings';
import { analyzeScript } from '@/lib/llm';
import { z } from 'zod';

const AuditRequestSchema = z.object({
  url: z.string().url().max(1000, 'URL 超过最大长度'),
});

function extractFilename(url: string): { filename: string; filenameDisplay: string } {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const filename = pathParts[pathParts.length - 1] || 'script';
    const filenameDisplay = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    return { filename, filenameDisplay };
  } catch {
    return { filename: 'script', filenameDisplay: 'script' };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const { url } = AuditRequestSchema.parse(body);

    // Fetch the script content
    let scriptContent: string;
    console.log('[审计] 开始下载:', url);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        return NextResponse.json(
          { error: `无法下载脚本 (${response.status})`, code: 'FETCH_ERROR' },
          { status: 502 }
        );
      }
      scriptContent = await response.text();
      console.log('[审计] 下载完成，脚本行数:', scriptContent.split('\n').length);
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        return NextResponse.json(
          { error: '下载超时，请检查 URL 是否可访问', code: 'FETCH_ERROR' },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: '下载失败，请检查 URL 是否有效', code: 'FETCH_ERROR' },
        { status: 502 }
      );
    }

    // Extract filename from URL
    const { filename, filenameDisplay } = extractFilename(url);

    // Create pending audit record before LLM call
    const auditId = createPendingAudit(url, filename, filenameDisplay, scriptContent);

    // Get settings and API key
    const settings = getSettings();
    const apiKey = await getApiKey();

    if (!settings.apiUrl || !apiKey) {
      updateAudit(auditId, { error: 'API 未配置' });
      return NextResponse.json(
        { error: '请先在设置页配置 LLM API', code: 'LLM_ERROR' },
        { status: 400 }
      );
    }

    // Call LLM
    console.log('[审计] 开始分析...');
    try {
      const result = await analyzeScript(
        scriptContent,
        {
          apiUrl: settings.apiUrl,
          apiKey,
          model: settings.model,
          maxLines: settings.maxLines,
          headLines: settings.headLines,
          tailLines: settings.tailLines,
        }
      );

      // Update audit with results
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

      console.log('[审计] 分析完成，风险等级:', result.summary.risk_level);

      return NextResponse.json({
        id: auditId,
        summary: {
          risk_level: result.summary.risk_level,
          network_ops: result.summary.network_ops,
          git_ops: result.summary.git_ops,
          telemetry: result.summary.telemetry,
          dangerous_patterns: result.summary.dangerous_patterns,
          risks: result.summary.risks,
          advice: result.summary.advice,
        },
        translated_script: result.translatedScript,
        truncated: result.truncated,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';

      if (error.includes('timeout') || error.includes('TimeoutError')) {
        updateAudit(auditId, { error: 'LLM 响应超时' });
        return NextResponse.json(
          { error: 'LLM 响应超时，请重试', code: 'TIMEOUT' },
          { status: 504 }
        );
      }

      if (error.includes('401') || error.includes('403') || error.includes('API')) {
        updateAudit(auditId, { error: 'LLM API 错误' });
        return NextResponse.json(
          { error: `LLM API 错误: ${error}`, code: 'LLM_ERROR' },
          { status: 502 }
        );
      }

      // Try to parse partial result - the LLM might have returned text without JSON
      updateAudit(auditId, { error: '解析失败' });
      return NextResponse.json(
        { error: `处理失败: ${error}`, code: 'PARSE_ERROR' },
        { status: 500 }
      );
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: '无效的请求参数', code: 'INVALID_URL', details: e.issues },
        { status: 400 }
      );
    }

    console.error('Audit error:', e);
    return NextResponse.json(
      { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
