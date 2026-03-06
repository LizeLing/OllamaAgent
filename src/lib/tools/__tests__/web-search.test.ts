import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchTool } from '../web-search';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('WebSearchTool', () => {
  describe('SearXNG provider', () => {
    it('string 생성자로 SearXNG 모드가 된다', async () => {
      const tool = new WebSearchTool('http://localhost:8888');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: 'Test', url: 'http://test.com', content: 'desc' }],
        }),
      });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8888/search'),
        expect.any(Object)
      );
    });

    it('config 객체로 SearXNG 모드가 된다', async () => {
      const tool = new WebSearchTool({ provider: 'searxng', searxngUrl: 'http://localhost:8888' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: 'Result', url: 'http://example.com', content: 'content' }],
        }),
      });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8888'),
        expect.any(Object)
      );
    });

    it('SearXNG 에러 시 에러를 반환한다', async () => {
      const tool = new WebSearchTool('http://localhost:8888');

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(false);
      expect(result.output).toContain('SearXNG returned 500');
    });

    it('결과가 없으면 안내 메시지를 반환한다', async () => {
      const tool = new WebSearchTool('http://localhost:8888');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await tool.execute({ query: 'noresults' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('No search results found.');
    });
  });

  describe('Ollama provider', () => {
    it('Ollama API를 호출한다', async () => {
      const tool = new WebSearchTool({
        provider: 'ollama',
        ollamaApiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { title: 'Ollama Result', url: 'http://ollama.com', content: 'desc' },
          ],
        }),
      });

      const result = await tool.execute({ query: 'AI search' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Ollama Result');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ollama.com/api/web_search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe('AI search');
    });

    it('API 키 없으면 에러를 반환한다', async () => {
      const tool = new WebSearchTool({
        provider: 'ollama',
        ollamaApiKey: '',
      });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(false);
      expect(result.output).toContain('API Key');
    });

    it('Ollama API 에러 시 에러를 반환한다', async () => {
      const tool = new WebSearchTool({
        provider: 'ollama',
        ollamaApiKey: 'key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(false);
      expect(result.output).toContain('401');
    });

    it('snippet 필드도 처리한다', async () => {
      const tool = new WebSearchTool({
        provider: 'ollama',
        ollamaApiKey: 'key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: 'T', url: 'http://t.com', snippet: 'snippet text' }],
        }),
      });

      const result = await tool.execute({ query: 'test' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('snippet text');
    });
  });

  describe('공통', () => {
    it('query가 빈 문자열이면 에러를 반환한다', async () => {
      const tool = new WebSearchTool('http://localhost:8888');
      const result = await tool.execute({ query: '' });

      expect(result.success).toBe(false);
      expect(result.output).toContain('required');
    });

    it('limit가 10을 초과하면 10으로 제한된다', async () => {
      const tool = new WebSearchTool({
        provider: 'ollama',
        ollamaApiKey: 'key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 15 }, (_, i) => ({
            title: `R${i}`, url: `http://r${i}.com`, content: `c${i}`,
          })),
        }),
      });

      const result = await tool.execute({ query: 'test', limit: 50 });

      const count = (result.output.match(/^\d+\./gm) || []).length;
      expect(count).toBeLessThanOrEqual(10);
    });
  });
});
