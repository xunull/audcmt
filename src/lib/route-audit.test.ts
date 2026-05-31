import { describe, it, expect, vi, beforeEach } from 'vitest';

// 回归测试：route.ts 改用 runAudit 后，/api/audit 的行为（状态码、响应体）必须不变。
vi.mock('@/lib/audit', () => ({
  runAudit: vi.fn(),
}));

import { POST } from '@/app/api/audit/route';
import { runAudit } from '@/lib/audit';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/audit', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const okSummary = {
  risk_level: 'low',
  network_ops: [],
  git_ops: [],
  telemetry: [],
  dangerous_patterns: [],
  risks: [],
  advice: 'ok',
};

beforeEach(() => vi.clearAllMocks());

describe('POST /api/audit — 回归', () => {
  it('成功 → 200，响应含 summary/translated_script', async () => {
    (runAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      id: 7,
      summary: okSummary,
      translatedScript: '# x',
      truncated: false,
    });
    const res = await POST(makeRequest({ url: 'https://example.com/i.sh' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(7);
    expect(json.summary.risk_level).toBe('low');
    expect(json.translated_script).toBe('# x');
  });

  it('无效 URL（非 url 字符串）→ 400 INVALID_URL', async () => {
    const res = await POST(makeRequest({ url: 'not-a-url' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_URL');
  });

  it('配置缺失 → 400（与原行为一致）', async () => {
    (runAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      id: 1,
      code: 'LLM_ERROR',
      error: '请先在设置页配置 LLM API',
    });
    const res = await POST(makeRequest({ url: 'https://example.com/i.sh' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('LLM_ERROR');
  });

  it('FETCH_ERROR → 502', async () => {
    (runAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: 'FETCH_ERROR',
      error: '下载失败',
    });
    const res = await POST(makeRequest({ url: 'https://example.com/i.sh' }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('FETCH_ERROR');
  });

  it('TIMEOUT → 504', async () => {
    (runAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      id: 2,
      code: 'TIMEOUT',
      error: 'LLM 响应超时',
    });
    const res = await POST(makeRequest({ url: 'https://example.com/i.sh' }));
    expect(res.status).toBe(504);
  });

  it('PARSE_ERROR → 500', async () => {
    (runAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      id: 3,
      code: 'PARSE_ERROR',
      error: '处理失败',
    });
    const res = await POST(makeRequest({ url: 'https://example.com/i.sh' }));
    expect(res.status).toBe(500);
  });
});
