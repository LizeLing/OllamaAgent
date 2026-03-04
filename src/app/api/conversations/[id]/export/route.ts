import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '@/lib/conversations/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const conv = await getConversation(id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const format = request.nextUrl.searchParams.get('format') || 'json';

    if (format === 'markdown') {
      let md = `# ${conv.title}\n\n`;
      for (const msg of conv.messages) {
        const role = msg.role === 'user' ? '사용자' : '어시스턴트';
        md += `**${role}**:\n${msg.content}\n\n---\n\n`;
      }
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${conv.title}.md"`,
        },
      });
    }

    return NextResponse.json(conv, {
      headers: {
        'Content-Disposition': `attachment; filename="${conv.id}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
