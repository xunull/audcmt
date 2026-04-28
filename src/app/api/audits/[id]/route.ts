import { NextRequest, NextResponse } from 'next/server';
import { getAudit, deleteAudit } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auditId = parseInt(id, 10);

    if (isNaN(auditId)) {
      return NextResponse.json({ error: '无效的 ID' }, { status: 400 });
    }

    const audit = getAudit(auditId);

    if (!audit) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ audit });
  } catch (e) {
    console.error('Get audit error:', e);
    return NextResponse.json({ error: '获取详情失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auditId = parseInt(id, 10);

    if (isNaN(auditId)) {
      return NextResponse.json({ error: '无效的 ID' }, { status: 400 });
    }

    const deleted = deleteAudit(auditId);

    if (!deleted) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Delete audit error:', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
