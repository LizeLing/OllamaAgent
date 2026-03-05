import { NextRequest, NextResponse } from 'next/server';
import { saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

function sanitizeMessage(msg: unknown): { role: string; content: string; timestamp: number } | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;

  const role = m.role;
  if (role !== 'user' && role !== 'assistant') return null;

  const content = typeof m.content === 'string' ? m.content.slice(0, 50000) : '';
  const timestamp = typeof m.timestamp === 'number' ? m.timestamp : Date.now();

  return { role, content, timestamp };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();

    // Validate and sanitize title
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '가져온 대화';

    // Validate and sanitize messages
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages
      .map(sanitizeMessage)
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(0, 1000); // Max 1000 messages

    const conv: Conversation = {
      id: uuidv4(),
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
      messages,
    };

    await saveConversation(conv);
    return NextResponse.json(conv, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to import conversation' }, { status: 500 });
  }
}
