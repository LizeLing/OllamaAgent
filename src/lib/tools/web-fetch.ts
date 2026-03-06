import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

export class WebFetchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'web_fetch',
    description: 'URL의 웹 페이지 내용을 가져옵니다. (Ollama Web Fetch API 사용)',
    parameters: [
      { name: 'url', type: 'string', description: '가져올 웹 페이지 URL', required: true },
    ],
  };

  constructor(private ollamaApiKey: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) return this.error('url is required');

    try {
      const res = await fetch('https://ollama.com/api/web_fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.ollamaApiKey}`,
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return this.error(`Web fetch returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const content = (data.content || data.text || '').slice(0, 8000);

      if (!content) {
        return this.success('페이지 내용을 가져올 수 없습니다.');
      }

      return this.success(content);
    } catch (err) {
      return this.error(
        `Web fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }
}
