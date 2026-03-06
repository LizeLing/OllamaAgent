import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

interface WebSearchConfig {
  provider: 'searxng' | 'ollama';
  searxngUrl?: string;
  ollamaApiKey?: string;
}

export class WebSearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'web_search',
    description: '웹 검색을 수행합니다.',
    parameters: [
      { name: 'query', type: 'string', description: '검색 쿼리', required: true },
      { name: 'limit', type: 'number', description: '결과 개수 (기본값: 5)', required: false },
    ],
  };

  private config: WebSearchConfig;

  constructor(configOrUrl: string | WebSearchConfig) {
    super();
    if (typeof configOrUrl === 'string') {
      this.config = { provider: 'searxng', searxngUrl: configOrUrl };
    } else {
      this.config = configOrUrl;
    }
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    if (!query) return this.error('query is required');

    const limit = Math.min((args.limit as number) || 5, 10);

    if (this.config.provider === 'ollama') {
      return this.searchWithOllama(query, limit);
    }
    return this.searchWithSearxng(query, limit);
  }

  private async searchWithSearxng(query: string, limit: number): Promise<ToolResult> {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
      });

      const res = await fetch(`${this.config.searxngUrl}/search?${params}`, {
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

  private async searchWithOllama(query: string, limit: number): Promise<ToolResult> {
    if (!this.config.ollamaApiKey) {
      return this.error('Ollama API Key가 설정되지 않았습니다. 설정에서 API Key를 입력해주세요.');
    }

    try {
      const res = await fetch('https://ollama.com/api/web_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.ollamaApiKey}`,
        },
        body: JSON.stringify({ query, max_results: limit }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return this.error(`Ollama Web Search returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const results = (data.results || []).slice(0, limit);

      if (results.length === 0) {
        return this.success('No search results found.');
      }

      const formatted = results
        .map(
          (r: { title: string; url: string; content: string; snippet?: string }, i: number) =>
            `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.content || r.snippet || ''}`
        )
        .join('\n\n');

      return this.success(formatted);
    } catch (err) {
      return this.error(
        `Ollama Web Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }
}
