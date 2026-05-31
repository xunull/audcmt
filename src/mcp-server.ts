#!/usr/bin/env node
/**
 * audcmt MCP server (stdio transport)
 *
 * 让 Claude Code 直接调用脚本审计能力，无需打开浏览器。
 * 复用 src/lib/audit.ts 的 runAudit / runAuditOnContent，与 Web UI 共享
 * 同一个 ~/.audcmt/audcmt.db。
 *
 * ⚠️ stdio 协议铁律：stdout 专属于 JSON-RPC。本进程所有日志只能走
 * stderr（console.error）。runAudit 内部也已统一用 console.error。
 *
 * 工具：
 *   audit_script(url)              下载 + 审计远程脚本
 *   audit_local_file(path)         审计本地脚本文件
 *   check_risk_gate(url, maxRisk)  审计并判断风险是否超过阈值
 *   get_audit(id)                  查单条审计记录
 *   list_audits(limit?)            最近 N 条审计记录
 *
 * 资源：
 *   audits://list                  审计历史列表
 *   audits://{id}                  单条审计详情
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';
import { runAudit, runAuditOnContent, type AuditResult } from './lib/audit';
import db, { getAudit, getAudits } from './lib/db';
import { formatAuditResult, looksBinary, riskGatePass } from './lib/mcp-format';

// 与 Web UI 进程并发写同一个 WAL 库时，避免偶发 SQLITE_BUSY。
// 放这里而非 db.ts，不影响 Next.js 进程。
db.pragma('busy_timeout = 3000');

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

const server = new McpServer({ name: 'audcmt', version: '0.1.0' });

// ---- 工具 ----

server.registerTool(
  'audit_script',
  {
    title: '审计远程脚本',
    description: '下载 GitHub raw 等 https 脚本 URL，用 LLM 分析安全风险并生成中文注释。返回风险等级、网络/Git/遥测/危险模式检测和建议。',
    inputSchema: { url: z.string().describe('脚本的 https URL，例如 https://raw.githubusercontent.com/user/repo/main/install.sh') },
  },
  async ({ url }) => {
    if (!url.startsWith('https://')) {
      return errorResult('仅支持 https:// 开头的 URL。');
    }
    const result = await runAudit(url);
    if (!result.ok) return errorResult(`审计失败 [${result.code}]：${result.error}`);
    return textResult(formatAuditResult(result.summary, result.translatedScript, result.truncated));
  }
);

server.registerTool(
  'audit_local_file',
  {
    title: '审计本地脚本文件',
    description: '读取本地脚本文件并用 LLM 分析安全风险、生成中文注释。适合审计已下载到本机的 install.sh 等。',
    inputSchema: { path: z.string().describe('本地脚本文件的绝对或相对路径') },
  },
  async ({ path: filePath }) => {
    let content: string;
    try {
      const buf = readFileSync(filePath);
      if (looksBinary(buf)) return errorResult(`文件 ${filePath} 看起来是二进制文件，无法审计脚本。`);
      content = buf.toString('utf-8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResult(`无法读取文件 ${filePath}：${msg}`);
    }
    const absPath = path.resolve(filePath);
    const filename = path.basename(absPath);
    const result = await runAuditOnContent(`file://${absPath}`, filename, content);
    if (!result.ok) return errorResult(`审计失败 [${result.code}]：${result.error}`);
    return textResult(formatAuditResult(result.summary, result.translatedScript, result.truncated));
  }
);

server.registerTool(
  'check_risk_gate',
  {
    title: '风险闸门检查',
    description: '审计远程脚本并判断风险是否超过给定阈值。返回 pass 布尔值，可用于自动决策（例如风险超过 medium 就拒绝执行）。注意：这是辅助判断，不是安全边界。',
    inputSchema: {
      url: z.string().describe('脚本的 https URL'),
      maxRisk: z.enum(['low', 'medium', 'high']).describe('可接受的最高风险等级，超过则 pass=false'),
    },
  },
  async ({ url, maxRisk }) => {
    if (!url.startsWith('https://')) return errorResult('仅支持 https:// 开头的 URL。');
    const result: AuditResult = await runAudit(url);
    if (!result.ok) return errorResult(`审计失败 [${result.code}]：${result.error}`);
    const pass = riskGatePass(result.summary.risk_level, maxRisk);
    return textResult(
      JSON.stringify({ pass, auditId: result.id, riskLevel: result.summary.risk_level, maxRisk })
    );
  }
);

server.registerTool(
  'get_audit',
  {
    title: '查询审计记录',
    description: '按 ID 查询单条审计历史记录。',
    inputSchema: { id: z.number().int().positive().describe('审计记录 ID') },
  },
  async ({ id }) => {
    const audit = getAudit(id);
    if (!audit) return errorResult(`审计记录 ${id} 不存在。`);
    return textResult(JSON.stringify(audit));
  }
);

server.registerTool(
  'list_audits',
  {
    title: '列出审计历史',
    description: '返回最近的审计记录列表（按时间倒序）。',
    inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认 20，最大 100') },
  },
  async ({ limit }) => {
    const audits = getAudits(1, limit ?? 20);
    return textResult(JSON.stringify(audits));
  }
);

// ---- 资源 ----

server.registerResource(
  'audits-list',
  'audits://list',
  { title: '审计历史列表', description: '最近的审计记录', mimeType: 'application/json' },
  async (uri) => {
    const audits = getAudits(1, 20);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(audits) }] };
  }
);

server.registerResource(
  'audit-detail',
  new ResourceTemplate('audits://{id}', { list: undefined }),
  { title: '审计详情', description: '单条审计记录详情', mimeType: 'application/json' },
  async (uri, { id }) => {
    const numId = parseInt(Array.isArray(id) ? id[0] : id, 10);
    const audit = Number.isFinite(numId) ? getAudit(numId) : undefined;
    if (!audit) {
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: `审计记录 ${id} 不存在` }) }] };
    }
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(audit) }] };
  }
);

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[audcmt-mcp] server ready on stdio');
}

// 仅在直接运行时启动（被测试 import 时不连接 stdio）
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  main().catch((e) => {
    console.error('[audcmt-mcp] fatal:', e);
    process.exit(1);
  });
}
