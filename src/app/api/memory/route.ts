import { NextResponse } from 'next/server';
import { getMemoryCount, purgeExpiredMemories } from '@/lib/memory/vector-store';

export async function GET() {
  try {
    const count = await getMemoryCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Failed to get memory count' }, { status: 500 });
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
