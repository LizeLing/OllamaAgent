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
      const modelInfo = request.nextUrl.searchParams.get('model') || '';
      let md = `# ${conv.title}\n\n`;
      md += `> 날짜: ${new Date(conv.createdAt).toLocaleString('ko-KR')}\n`;
      if (modelInfo) md += `> 모델: ${modelInfo}\n`;
      md += `> 메시지 수: ${conv.messages.length}\n\n---\n\n`;

      for (const msg of conv.messages) {
        const role = msg.role === 'user' ? '**사용자**' : '**어시스턴트**';
        md += `${role}:\n\n`;

        // Tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            md += `<details>\n<summary>🔧 ${tc.tool} ${tc.success === false ? '(실패)' : ''}</summary>\n\n`;
            md += '```json\n' + JSON.stringify(tc.input, null, 2) + '\n```\n\n';
            if (tc.output) {
              md += '**결과:**\n```\n' + tc.output.slice(0, 2000) + '\n```\n';
            }
            md += '</details>\n\n';
          }
        }

        md += msg.content + '\n\n---\n\n';
      }

      const safeTitle = conv.title.replace(/[^\w가-힣\s.-]/g, '_');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}.md"; filename*=UTF-8''${encodeURIComponent(conv.title)}.md`,
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
