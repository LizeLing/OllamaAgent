import { NextRequest, NextResponse } from 'next/server';
import { getPreset, savePreset, deletePreset } from '@/lib/presets/storage';
import { withErrorHandler } from '@/lib/api/handler';
import { createPresetSchema } from '@/lib/api/schemas';

export const GET = withErrorHandler('PRESETS', async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const preset = await getPreset(id);
  if (!preset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ preset });
});

export const PUT = withErrorHandler('PRESETS', async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = createPresetSchema.parse(body);
  const preset = { ...parsed, id };
  await savePreset(preset);
  return NextResponse.json({ preset });
});

export const DELETE = withErrorHandler('PRESETS', async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const deleted = await deletePreset(id);
  if (!deleted) {
    return NextResponse.json({ error: '기본 프리셋은 삭제할 수 없습니다.' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
});
