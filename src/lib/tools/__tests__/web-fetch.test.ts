import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebFetchTool } from '../web-fetch';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('WebFetchTool', () => {
  const tool = new WebFetchTool('test-api-key');

  it('Ollama Web Fetch API를 호출한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: 'Page content here' }),
    });

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Page content here');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ollama.com/api/web_fetch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
        }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe('http://example.com');
  });

  it('url이 없으면 에러를 반환한다', async () => {
    const result = await tool.execute({ url: '' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });

  it('API 에러 시 에러를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('500');
  });

  it('내용이 8000자를 초과하면 잘라낸다', async () => {
    const longContent = 'x'.repeat(10000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: longContent }),
    });

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(true);
    expect(result.output.length).toBe(8000);
  });

  it('내용이 없으면 안내 메시지를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('가져올 수 없습니다');
  });

  it('text 필드도 fallback으로 사용한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'text field content' }),
    });

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('text field content');
  });

  it('네트워크 에러 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await tool.execute({ url: 'http://example.com' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('network error');
  });
});
