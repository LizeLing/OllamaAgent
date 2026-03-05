import { NextRequest, NextResponse } from 'next/server';
import { getConversation, saveConversation } from '@/lib/conversations/storage';
import { generate } from '@/lib/ollama/client';
import { loadSettings } from '@/lib/config/settings';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const conv = await getConversation(id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const firstUserMessage = conv.messages.find((m) => m.role === 'user');
    if (!firstUserMessage) {
      return NextResponse.json({ error: 'No user message found' }, { status: 400 });
    }

    const settings = await loadSettings();
    const content = firstUserMessage.content.slice(0, 200);

    const result = await generate(settings.ollamaUrl, {
      model: settings.ollamaModel,
      prompt: `다음 대화의 제목을 한국어로 10자 이내로 요약하세요. 제목만 출력하세요.\n\n사용자: ${content}`,
      think: false,
      options: { num_predict: 30 },
    });

    let title = result.response.trim();
    // Strip surrounding quotes
    title = title.replace(/^["'""'']+|["'""'']+$/g, '');
    // Limit to 50 chars
    title = title.slice(0, 50);

    if (title) {
      conv.title = title;
      conv.updatedAt = Date.now();
      await saveConversation(conv);
    }

    return NextResponse.json({ title: conv.title });
  } catch {
    return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
  }
}
