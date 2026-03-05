import { describe, it, expect, vi } from 'vitest';
import { isModelError, chatWithFailover, ChatFn } from '../failover';
import { OllamaError, OllamaChatRequest, OllamaChatResponse } from '../types';

function makeResponse(model: string): OllamaChatResponse {
  return {
    model,
    message: { role: 'assistant', content: `response from ${model}` },
    done: true,
  };
}

function makeRequest(model: string): OllamaChatRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'hello' }],
  };
}

describe('isModelError', () => {
  it('404는 모델 에러', () => {
    const error = new OllamaError('model not found', 404);
    expect(isModelError(error)).toBe(true);
  });

  it('모델 로드 실패 메시지는 모델 에러', () => {
    expect(isModelError(new Error('failed to load model'))).toBe(true);
    expect(isModelError(new Error('model not found'))).toBe(true);
    expect(isModelError(new Error('out of memory'))).toBe(true);
    expect(isModelError(new Error('insufficient memory for model'))).toBe(true);
    expect(isModelError(new Error('resource not found'))).toBe(true);
  });

  it('네트워크 에러는 모델 에러 아님', () => {
    const error = new OllamaError('Ollama connection failed: fetch failed');
    expect(isModelError(error)).toBe(false);
  });

  it('400은 모델 에러 아님', () => {
    const error = new OllamaError('Bad Request', 400);
    expect(isModelError(error)).toBe(false);
  });
});

describe('chatWithFailover', () => {
  it('기본 모델 성공 시 그대로 반환', async () => {
    const chatFn: ChatFn = vi.fn().mockResolvedValueOnce(makeResponse('llama3'));
    const request = makeRequest('llama3');

    const result = await chatWithFailover(chatFn, 'http://localhost:11434', request, ['mistral']);

    expect(result.result).toEqual(makeResponse('llama3'));
    expect(result.usedModel).toBe('llama3');
    expect(result.failedModels).toEqual([]);
    expect(chatFn).toHaveBeenCalledTimes(1);
  });

  it('기본 모델 404 시 fallback 시도', async () => {
    const chatFn: ChatFn = vi.fn()
      .mockRejectedValueOnce(new OllamaError('model not found', 404))
      .mockResolvedValueOnce(makeResponse('mistral'));
    const request = makeRequest('llama3');

    const result = await chatWithFailover(chatFn, 'http://localhost:11434', request, ['mistral']);

    expect(result.result).toEqual(makeResponse('mistral'));
    expect(result.usedModel).toBe('mistral');
    expect(result.failedModels).toEqual(['llama3']);
    expect(chatFn).toHaveBeenCalledTimes(2);
    // 두 번째 호출에서 model이 mistral로 변경되었는지 확인
    expect((chatFn as ReturnType<typeof vi.fn>).mock.calls[1][1].model).toBe('mistral');
  });

  it('모든 모델 실패 시 에러', async () => {
    const chatFn: ChatFn = vi.fn()
      .mockRejectedValueOnce(new OllamaError('not found', 404))
      .mockRejectedValueOnce(new OllamaError('not found', 404))
      .mockRejectedValueOnce(new OllamaError('not found', 404));
    const request = makeRequest('llama3');

    await expect(
      chatWithFailover(chatFn, 'http://localhost:11434', request, ['mistral', 'phi3'])
    ).rejects.toThrow('모든 모델이 실패했습니다: llama3, mistral, phi3');
  });

  it('네트워크 에러는 failover 안 하고 바로 throw', async () => {
    const networkError = new OllamaError('Ollama connection failed: fetch failed');
    const chatFn: ChatFn = vi.fn().mockRejectedValueOnce(networkError);
    const request = makeRequest('llama3');

    await expect(
      chatWithFailover(chatFn, 'http://localhost:11434', request, ['mistral'])
    ).rejects.toThrow('Ollama connection failed');
    expect(chatFn).toHaveBeenCalledTimes(1);
  });

  it('fallback 빈 배열이면 원본 에러 throw', async () => {
    const originalError = new OllamaError('model not found', 404);
    const chatFn: ChatFn = vi.fn().mockRejectedValueOnce(originalError);
    const request = makeRequest('llama3');

    await expect(
      chatWithFailover(chatFn, 'http://localhost:11434', request, [])
    ).rejects.toThrow(originalError);
    expect(chatFn).toHaveBeenCalledTimes(1);
  });
});
