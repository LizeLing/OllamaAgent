import { NextRequest, NextResponse } from 'next/server';
import { forkConversation, getConversation } from '@/lib/conversations/storage';
import { withErrorHandler } from '@/lib/api/handler';

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  'CONVERSATIONS',
  async (request: NextRequest, context: Params) => {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const messageIndex = Number(body?.messageIndex);
    const title = typeof body?.title === 'string' ? body.title.slice(0, 100) : undefined;

    if (!Number.isInteger(messageIndex) || messageIndex < 0) {
      return NextResponse.json(
        { error: 'messageIndex는 0 이상의 정수여야 합니다' },
        { status: 400 },
      );
    }

    const source = await getConversation(id);
    if (!source) {
      return NextResponse.json({ error: '대화를 찾을 수 없습니다' }, { status: 404 });
    }

    if (messageIndex >= source.messages.length) {
      return NextResponse.json(
        {
          error: `messageIndex(${messageIndex})가 messages 길이(${source.messages.length})를 초과합니다`,
        },
        { status: 400 },
      );
    }

    const forked = await forkConversation(id, messageIndex, { title });
    return NextResponse.json(
      {
        id: forked.id,
        conversation: forked,
        forkedFrom: forked.forkedFrom,
      },
      { status: 201 },
    );
  },
);
