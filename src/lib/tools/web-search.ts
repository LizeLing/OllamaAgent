import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

export class WebSearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'web_search',
    description: 'SearXNG를 사용하여 웹 검색을 수행합니다.',
    parameters: [
      { name: 'query', type: 'string', description: '검색 쿼리', required: true },
      { name: 'limit', type: 'number', description: '결과 개수 (기본값: 5)', required: false },
    ],
  };

  constructor(private searxngUrl: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    if (!query) return this.error('query is required');

    const limit = Math.min((args.limit as number) || 5, 10);

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
      });

      const res = await fetch(`${this.searxngUrl}/search?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return this.error(`SearXNG returned ${res.status}`);
      }

      const data = await res.json();
      const results = (data.results || []).slice(0, limit);

      if (results.length === 0) {
        return this.success('No search results found.');
      }

      const formatted = results
        .map(
          (r: { title: string; url: string; content: string }, i: number) =>
            `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.content || ''}`
        )
        .join('\n\n');

      return this.success(formatted);
    } catch (err) {
      return this.error(
        `Web search failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }
}
