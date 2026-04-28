import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings, getApiKey } from '@/lib/settings';
import { z } from 'zod';

const SettingsSchema = z.object({
  apiUrl: z.string().url('无效的 API URL'),
  apiKey: z.string().min(1, 'API Key 不能为空').optional(),
  model: z.string().min(1, '模型名称不能为空'),
  maxLines: z.number().min(100).max(10000).optional(),
  headLines: z.number().min(1).max(5000).optional(),
  tailLines: z.number().min(1).max(1000).optional(),
});

export async function GET() {
  try {
    const settings = getSettings();
    const hasApiKey = !!(await getApiKey());

    return NextResponse.json({
      apiUrl: settings.apiUrl,
      model: settings.model,
      configured: !!(settings.apiUrl && hasApiKey),
      maxLines: settings.maxLines,
      headLines: settings.headLines,
      tailLines: settings.tailLines,
    });
  } catch (e) {
    console.error('Get settings error:', e);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = SettingsSchema.parse(body);

    await saveSettings({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      maxLines: settings.maxLines ?? 1500,
      headLines: settings.headLines ?? 1000,
      tailLines: settings.tailLines ?? 300,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: '无效的设置', details: e.issues },
        { status: 400 }
      );
    }
    console.error('Save settings error:', e);
    return NextResponse.json({ error: '保存设置失败' }, { status: 500 });
  }
}
