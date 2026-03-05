import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

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

    // SSRF prevention: block internal/private URLs
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      const blockedHosts = ['localhost', '0.0.0.0', '::1', '::'];
      if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return this.error('내부 네트워크 URL에는 접근할 수 없습니다.');
      }
      // Block IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1)
      if (hostname.startsWith('::ffff:')) {
        return this.error('내부 네트워크 URL에는 접근할 수 없습니다.');
      }
      // Block private/special IPv4 ranges
      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const [, a, b] = ipMatch.map(Number);
        if (
          a === 0 ||                                          // 0.0.0.0/8
          a === 10 ||                                         // 10.0.0.0/8
          a === 127 ||                                        // 127.0.0.0/8 (loopback)
          (a === 169 && b === 254) ||                         // 169.254.0.0/16 (link-local)
          (a === 172 && b >= 16 && b <= 31) ||                // 172.16.0.0/12
          (a === 192 && b === 168)                            // 192.168.0.0/16
        ) {
          return this.error('사설 IP 대역에는 접근할 수 없습니다.');
        }
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return this.error('HTTP/HTTPS 프로토콜만 허용됩니다.');
      }
    } catch {
      return this.error('유효하지 않은 URL입니다.');
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
