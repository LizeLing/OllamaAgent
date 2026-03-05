import { NextResponse } from 'next/server';
import { readIndex } from '@/lib/conversations/storage';
import { getMemoryCount } from '@/lib/memory/vector-store';

export async function GET() {
  try {
    const conversations = await readIndex();
    const memoryCount = await getMemoryCount();

    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const pinnedCount = conversations.filter((c) => c.pinned).length;
    const tagCounts: Record<string, number> = {};

    for (const c of conversations) {
      if (c.tags) {
        for (const tag of c.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    // Activity by date (last 7 days)
    const now = Date.now();
    const dailyActivity: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * 86400000);
      const key = date.toISOString().slice(0, 10);
      dailyActivity[key] = 0;
    }
    for (const c of conversations) {
      const key = new Date(c.updatedAt).toISOString().slice(0, 10);
      if (key in dailyActivity) {
        dailyActivity[key]++;
      }
    }

    return NextResponse.json({
      totalConversations,
      totalMessages,
      pinnedCount,
      memoryCount,
      tagCounts,
      dailyActivity,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
