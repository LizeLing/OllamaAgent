import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaError } from '../types';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Ollama Client', () => {
  let chat: typeof import('../client').chat;
  let chatStream: typeof import('../client').chatStream;
  let generate: typeof import('../client').generate;
  let embed: typeof import('../client').embed;
  let checkHealth: typeof import('../client').checkHealth;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    const mod = await import('../client');
    chat = mod.chat;
    chatStream = mod.chatStream;
    generate = mod.generate;
    embed = mod.embed;
    checkHealth = mod.checkHealth;
  });

  describe('chat()', () => {
    it('올바른 POST body를 전송한다 (stream:false, think:false)', async () => {
      const responseBody = { model: 'test', message: { role: 'assistant', content: 'hi' }, done: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });

      const result = await chat('http://localhost:11434', {
        model: 'test',
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBe(false);
      expect(body.think).toBe(false);
      expect(result).toEqual(responseBody);
    });

    it('파싱된 JSON 응답을 반환한다', async () => {
      const responseBody = { model: 'test', message: { role: 'assistant', content: 'response' }, done: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });

      const result = await chat('http://localhost:11434', {
        model: 'test',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.message.content).toBe('response');
    });
  });

  describe('chatStream()', () => {
    it('NDJSON 청크를 yield한다', async () => {
      const chunks = [
        { model: 'test', message: { role: 'assistant', content: 'he' }, done: false },
        { model: 'test', message: { role: 'assistant', content: 'llo' }, done: true },
      ];
      const encoded = new TextEncoder().encode(chunks.map(c => JSON.stringify(c)).join('\n') + '\n');
      let readCalled = false;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: () => {
              if (!readCalled) {
                readCalled = true;
                return Promise.resolve({ done: false, value: encoded });
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          }),
        },
      });

      const results: unknown[] = [];
      for await (const chunk of chatStream('http://localhost:11434', { model: 'test', messages: [] })) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(chunks[0]);
    });

    it('불완전한 청크를 처리한다', async () => {
      const chunk1 = new TextEncoder().encode('{"model":"test","message":{"role":"assistant","content":"a"},"done":false}\n{"model":"te');
      const chunk2 = new TextEncoder().encode('st","message":{"role":"assistant","content":"b"},"done":true}\n');
      let callCount = 0;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: () => {
              callCount++;
              if (callCount === 1) return Promise.resolve({ done: false, value: chunk1 });
              if (callCount === 2) return Promise.resolve({ done: false, value: chunk2 });
              return Promise.resolve({ done: true, value: undefined });
            },
          }),
        },
      });

      const results: unknown[] = [];
      for await (const chunk of chatStream('http://localhost:11434', { model: 'test', messages: [] })) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
    });

    it('잘못된 JSON을 건너뛴다', async () => {
      const data = new TextEncoder().encode('not-json\n{"model":"test","message":{"role":"assistant","content":"ok"},"done":true}\n');
      let readCalled = false;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: () => {
              if (!readCalled) {
                readCalled = true;
                return Promise.resolve({ done: false, value: data });
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          }),
        },
      });

      const results: unknown[] = [];
      for await (const chunk of chatStream('http://localhost:11434', { model: 'test', messages: [] })) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });
  });

  describe('fetchWithRetry()', () => {
    it('네트워크 오류 시 최대 2회 재시도한다 (backoff 1s→2s)', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: true }) });

      const promise = chat('http://localhost:11434', { model: 'test', messages: [] });
      // First retry: 1s delay
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: 2s delay
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('4xx/5xx 상태 코드에서 OllamaError를 던진다', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      await expect(chat('http://localhost:11434', { model: 'test', messages: [] }))
        .rejects.toThrow('Ollama API error');
    });
  });

  describe('embed()', () => {
    it('올바른 body를 전송하고 embeddings를 반환한다', async () => {
      const embeddingResponse = { model: 'embed', embeddings: [[0.1, 0.2, 0.3]] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(embeddingResponse),
      });

      const result = await embed('http://localhost:11434', { model: 'embed', input: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embed',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    });
  });

  describe('generate()', () => {
    it('stream:false로 올바른 body를 전송한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ model: 'test', response: 'generated', done: true }),
      });

      const result = await generate('http://localhost:11434', { model: 'test', prompt: 'hello' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBe(false);
      expect(result.response).toBe('generated');
    });
  });

  describe('checkHealth()', () => {
    it('ok 응답에서 true를 반환한다', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      expect(await checkHealth('http://localhost:11434')).toBe(true);
    });

    it('에러 시 false를 반환한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      expect(await checkHealth('http://localhost:11434')).toBe(false);
    });
  });
});
