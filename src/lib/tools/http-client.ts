import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { validateUrlForSSRF } from './url-validator';

export class HttpClientTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'http_request',
    description: 'HTTP 요청을 보내고 응답을 반환합니다.',
    parameters: [
      { name: 'url', type: 'string', description: '요청 URL', required: true },
      { name: 'method', type: 'string', description: 'HTTP 메서드 (GET, POST 등). 기본값: GET', required: false },
      { name: 'body', type: 'string', description: '요청 본문 (POST 등)', required: false },
      { name: 'headers', type: 'object', description: '요청 헤더 (JSON 객체)', required: false },
    ],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) return this.error('url is required');

    // SSRF prevention
    const urlCheck = validateUrlForSSRF(url);
    if (!urlCheck.valid) {
      return this.error(urlCheck.error || '유효하지 않은 URL입니다.');
    }

    const method = ((args.method as string) || 'GET').toUpperCase();
    const body = args.body as string | undefined;
    const headers = (args.headers as Record<string, string>) || {};

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
        signal: AbortSignal.timeout(10000),
      });

      const contentType = res.headers.get('content-type') || '';
      let responseBody: string;
      if (contentType.includes('json')) {
        const json = await res.json();
        responseBody = JSON.stringify(json, null, 2);
      } else {
        responseBody = await res.text();
      }

      if (responseBody.length > 5000) {
        responseBody = responseBody.slice(0, 5000) + '\n... (truncated)';
      }

      return this.success(`Status: ${res.status} ${res.statusText}\n\n${responseBody}`);
    } catch (err) {
      return this.error(`HTTP request failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
