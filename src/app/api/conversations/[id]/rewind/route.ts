import { NextRequest, NextResponse } from 'next/server';
import { getConversation, rewindConversation } from '@/lib/conversations/storage';
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

    if (!Number.isInteger(messageIndex) || messageIndex < 0) {
      return NextResponse.json(
        { error: 'messageIndex는 0 이상의 정수여야 합니다' },
        { status: 400 },
      );
    }

    const existing = await getConversation(id);
    if (!existing) {
      return NextResponse.json({ error: '대화를 찾을 수 없습니다' }, { status: 404 });
    }

    if (messageIndex >= existing.messages.length) {
      return NextResponse.json(
        {
          error: `messageIndex(${messageIndex})가 messages 길이(${existing.messages.length})를 초과합니다`,
        },
        { status: 400 },
      );
    }

    const rewound = await rewindConversation(id, messageIndex);
    return NextResponse.json({
      id: rewound.id,
      conversation: rewound,
      rewoundFrom: rewound.rewoundFrom,
    });
  },
);
