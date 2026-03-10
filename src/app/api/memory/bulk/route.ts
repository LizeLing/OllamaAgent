import { NextResponse } from 'next/server';
import { deleteVector } from '@/lib/memory/vector-store';

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    let deleted = 0;
    for (const id of ids) {
      await deleteVector(id);
      deleted++;
    }

    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: 'Failed to bulk delete' }, { status: 500 });
  }
}
