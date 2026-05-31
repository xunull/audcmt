import { NextRequest, NextResponse } from 'next/server';
import { runAudit, type AuditErrorCode } from '@/lib/audit';
import { z } from 'zod';

const AuditRequestSchema = z.object({
  url: z.string().url().max(1000, 'URL 超过最大长度'),
});

// 审计错误码 → HTTP 状态码（保持原有 API 行为不变）
const ERROR_STATUS: Record<AuditErrorCode, number> = {
  FETCH_ERROR: 502,
  LLM_ERROR: 502,
  TIMEOUT: 504,
  PARSE_ERROR: 500,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = AuditRequestSchema.parse(body);

    const result = await runAudit(url);

    if (!result.ok) {
      // 配置缺失返回 400（与原行为一致）；其余按错误码映射
      const status =
        result.code === 'LLM_ERROR' && result.error.includes('配置')
          ? 400
          : ERROR_STATUS[result.code];
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({
      id: result.id,
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
