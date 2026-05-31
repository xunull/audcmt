import { describe, it, expect, vi, beforeEach } from 'vitest';

// 全部 mock 外部依赖，隔离 runAudit 编排逻辑（不碰真实 DB / 网络 / LLM）
vi.mock('./db', () => ({
  createPendingAudit: vi.fn(() => 42),
  updateAudit: vi.fn(),
}));
vi.mock('./settings', () => ({
  getSettings: vi.fn(() => ({
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxLines: 1500,
    headLines: 1000,
    tailLines: 300,
  })),
  getApiKey: vi.fn(async () => 'sk-test'),
}));
vi.mock('./llm', () => ({
  analyzeScript: vi.fn(),
}));

import { runAudit, runAuditOnContent, extractFilename } from './audit';
import { createPendingAudit, updateAudit } from './db';
import { getSettings, getApiKey } from './settings';
import { analyzeScript } from './llm';

const okSummary = {
  risk_level: 'low',
  network_ops: [],
  git_ops: [],
  telemetry: [],
  dangerous_patterns: [],
  risks: [],
  advice: '可以执行',
};

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 settings 已配置
  (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxLines: 1500,
    headLines: 1000,
    tailLines: 300,
  });
  (getApiKey as ReturnType<typeof vi.fn>).mockResolvedValue('sk-test');
  (createPendingAudit as ReturnType<typeof vi.fn>).mockReturnValue(42);
});

describe('extractFilename', () => {
  it('从 URL 提取文件名和显示名', () => {
    expect(extractFilename('https://raw.githubusercontent.com/u/r/main/install.sh')).toEqual({
      filename: 'install.sh',
      filenameDisplay: 'install',
    });
  });
  it('无效 URL 回退到 script', () => {
    expect(extractFilename('not a url')).toEqual({ filename: 'script', filenameDisplay: 'script' });
  });
});

describe('runAudit — happy path', () => {
  it('下载成功 → 分析 → 落库 → 返回 ok', async () => {
    global.fetch = vi.fn(async () => new Response('echo hi', { status: 200 })) as typeof fetch;
    (analyzeScript as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: okSummary,
      translatedScript: '# 注释\necho hi',
      truncated: false,
    });

    const result = await runAudit('https://example.com/install.sh');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe(42);
      expect(result.summary.risk_level).toBe('low');
    }
    expect(createPendingAudit).toHaveBeenCalledOnce();
    expect(updateAudit).toHaveBeenCalledWith(42, expect.objectContaining({ riskLevel: 'low' }));
  });
});

describe('runAudit — fetch 错误路径', () => {
  it('非 200 → FETCH_ERROR，不建 pending 记录', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as typeof fetch;
    const result = await runAudit('https://example.com/missing.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FETCH_ERROR');
    expect(createPendingAudit).not.toHaveBeenCalled();
  });

  it('超时 → FETCH_ERROR', async () => {
    global.fetch = vi.fn(async () => {
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      throw err;
    }) as typeof fetch;
    const result = await runAudit('https://example.com/slow.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FETCH_ERROR');
  });
});

describe('runAudit — 配置与 LLM 错误路径', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response('echo hi', { status: 200 })) as typeof fetch;
  });

  it('settings 未配置 → LLM_ERROR + 配置提示，记录标记 error', async () => {
    (getApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await runAudit('https://example.com/install.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LLM_ERROR');
      expect(result.error).toContain('配置');
    }
    expect(updateAudit).toHaveBeenCalledWith(42, { error: 'API 未配置' });
  });

  it('LLM 401 → LLM_ERROR', async () => {
    (analyzeScript as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('401 Unauthorized'));
    const result = await runAudit('https://example.com/install.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LLM_ERROR');
  });

  it('LLM timeout → TIMEOUT', async () => {
    (analyzeScript as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('request timeout'));
    const result = await runAudit('https://example.com/install.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TIMEOUT');
  });

  it('LLM 其他异常 → PARSE_ERROR', async () => {
    (analyzeScript as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('something weird'));
    const result = await runAudit('https://example.com/install.sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PARSE_ERROR');
  });
});

describe('runAuditOnContent — 本地文件', () => {
  it('直接审计内容，不下载，url 落库为 file://', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    (analyzeScript as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: okSummary,
      translatedScript: '# 注释',
      truncated: false,
    });

    const result = await runAuditOnContent('file:///tmp/install.sh', 'install.sh', 'echo hi');

    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createPendingAudit).toHaveBeenCalledWith(
      'file:///tmp/install.sh',
      'install.sh',
      'install',
      'echo hi'
    );
  });
});

describe('runAudit — stdout 不被污染（MCP 协议完整性）', () => {
  it('整个审计流程不向 stdout 写任何东西', async () => {
    global.fetch = vi.fn(async () => new Response('echo hi', { status: 200 })) as typeof fetch;
    (analyzeScript as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: okSummary,
      translatedScript: '# 注释',
      truncated: false,
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await runAudit('https://example.com/install.sh');

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
