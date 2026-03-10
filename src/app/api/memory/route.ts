import { NextResponse } from 'next/server';
import { getMemoryCount, getMemoryList, purgeExpiredMemories } from '@/lib/memory/vector-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const list = searchParams.get('list');

    if (list === 'true') {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const category = searchParams.get('category') || undefined;

      const result = await getMemoryList({ page, limit, category });
      return NextResponse.json(result);
    }

    const count = await getMemoryCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Failed to get memories' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxAgeDays = parseInt(searchParams.get('maxAgeDays') || '30');
    const maxCount = parseInt(searchParams.get('maxCount') || '1000');

    const deleted = await purgeExpiredMemories(maxAgeDays, maxCount);
    const remaining = await getMemoryCount();

    return NextResponse.json({ deleted, remaining });
  } catch {
    return NextResponse.json({ error: 'Failed to purge memories' }, { status: 500 });
  }
}
