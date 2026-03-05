import { NextRequest, NextResponse } from 'next/server';
import { listConversations, saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const conversations = await listConversations();
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('[CONVERSATIONS_LIST_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = Date.now();

    const conv: Conversation = {
      id: uuidv4(),
      title: body.title || '새 대화',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: body.messages || [],
    };

    await saveConversation(conv);
    return NextResponse.json(conv, { status: 201 });
  } catch (error) {
    console.error('[CONVERSATIONS_CREATE_ERROR]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
