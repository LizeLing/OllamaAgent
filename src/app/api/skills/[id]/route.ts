import { NextRequest, NextResponse } from 'next/server';
import { getSkill, saveSkill, deleteSkill } from '@/lib/skills/storage';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await getSkill(id);
  if (!skill) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ skill });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const skill = { ...body, id };
  await saveSkill(skill);
  return NextResponse.json({ skill });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteSkill(id);
  if (!deleted) {
    return NextResponse.json({ error: '기본 스킬은 삭제할 수 없습니다.' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
