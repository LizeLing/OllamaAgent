import { NextResponse } from 'next/server';
import { deleteVector } from '@/lib/memory/vector-store';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteVector(id);
    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
}
