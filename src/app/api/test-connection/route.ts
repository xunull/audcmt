import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/llm';
import { z } from 'zod';

const TestConnectionSchema = z.object({
  apiUrl: z.string().url('无效的 API URL'),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  model: z.string().min(1, '模型名称不能为空'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, apiKey, model } = TestConnectionSchema.parse(body);

    const result = await testConnection({ apiUrl, apiKey, model });

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: '无效的请求参数' },
        { status: 400 }
      );
    }

    const error = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error },
      { status: 400 }
    );
  }
}
