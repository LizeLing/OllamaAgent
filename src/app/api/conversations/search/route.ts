import { NextRequest, NextResponse } from 'next/server';
import { searchConversations } from '@/lib/conversations/storage';

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q') || '';
    if (!query.trim()) {
      return NextResponse.json([]);
    }
    const results = await searchConversations(query);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
