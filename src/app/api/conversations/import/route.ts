import { NextRequest, NextResponse } from 'next/server';
import { saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();

    const conv: Conversation = {
      id: uuidv4(),
      title: body.title || '가져온 대화',
      createdAt: now,
      updatedAt: now,
      messageCount: body.messages?.length || 0,
      messages: body.messages || [],
    };

    await saveConversation(conv);
    return NextResponse.json(conv, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to import conversation' }, { status: 500 });
  }
}
