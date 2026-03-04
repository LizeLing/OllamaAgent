import { NextRequest, NextResponse } from 'next/server';
import { getPreset, savePreset, deletePreset } from '@/lib/presets/storage';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preset = await getPreset(id);
  if (!preset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ preset });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const preset = { ...body, id };
  await savePreset(preset);
  return NextResponse.json({ preset });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deletePreset(id);
  if (!deleted) {
    return NextResponse.json({ error: '기본 프리셋은 삭제할 수 없습니다.' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
