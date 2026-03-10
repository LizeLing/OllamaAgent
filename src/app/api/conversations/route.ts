import { NextRequest, NextResponse } from 'next/server';
import { listConversations, saveConversation } from '@/lib/conversations/storage';
import { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';
import { v4 as uuidv4 } from 'uuid';
import { HookExecutor } from '@/lib/hooks/executor';
import { withErrorHandler } from '@/lib/api/handler';
import { createConversationSchema } from '@/lib/api/schemas';

export const GET = withErrorHandler('CONVERSATIONS', async () => {
  const conversations = await listConversations();
  return NextResponse.json(conversations);
});

export const POST = withErrorHandler('CONVERSATIONS', async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const parsed = createConversationSchema.parse(body);
  const now = Date.now();

  const conv: Conversation = {
    id: uuidv4(),
    title: parsed.title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: parsed.messages as Message[],
  };

  await saveConversation(conv);
  HookExecutor.fireAndForget('on_conversation_created', { conversationId: conv.id, title: conv.title });
  return NextResponse.json(conv, { status: 201 });
});
