import { describe, it, expect, beforeAll } from 'vitest';
import { checkOllamaAvailable } from '@/test/helpers/service-checker';
import { checkHealth, chat, chatStream, embed } from '../client';
import { OllamaError } from '../types';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:8b';

let ollamaAvailable = false;

beforeAll(async () => {
  ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
});

describe.skipIf(!ollamaAvailable)('Ollama Client Integration', () => {
  // Re-check inside describe for runtime skip evaluation
  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
  });

  it('checkHealth returns true when Ollama is running', async () => {
    const healthy = await checkHealth(OLLAMA_URL);
    expect(healthy).toBe(true);
  });

  it('checkHealth returns false for invalid URL', async () => {
    const healthy = await checkHealth('http://localhost:19999');
    expect(healthy).toBe(false);
  });

  it('chat returns a response with message content', async () => {
    const response = await chat(OLLAMA_URL, {
      model: MODEL,
      messages: [
        { role: 'user', content: 'Reply with exactly: HELLO' },
      ],
      options: { temperature: 0 },
    });

    expect(response).toBeDefined();
    expect(response.message).toBeDefined();
    expect(response.message.content).toBeTruthy();
    expect(response.done).toBe(true);
  }, 30000);

  it('chatStream yields chunks ending with done:true', async () => {
    const chunks: { content: string; done: boolean }[] = [];

    for await (const chunk of chatStream(OLLAMA_URL, {
      model: MODEL,
      messages: [
        { role: 'user', content: 'Say "hi" in one word.' },
      ],
      options: { temperature: 0, num_predict: 20 },
    })) {
      chunks.push({
        content: chunk.message?.content || '',
        done: chunk.done,
      });
    }

    expect(chunks.length).toBeGreaterThan(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.done).toBe(true);

    const fullContent = chunks.map((c) => c.content).join('');
    expect(fullContent.length).toBeGreaterThan(0);
  }, 30000);

  it('embed returns embeddings array', async () => {
    const response = await embed(OLLAMA_URL, {
      model: EMBEDDING_MODEL,
      input: 'Hello world',
    });

    expect(response).toBeDefined();
    expect(response.embeddings).toBeDefined();
    expect(Array.isArray(response.embeddings)).toBe(true);
    expect(response.embeddings.length).toBeGreaterThan(0);
    expect(response.embeddings[0].length).toBeGreaterThan(0);
    // Each element should be a number
    expect(typeof response.embeddings[0][0]).toBe('number');
  }, 30000);

  it('chat with invalid model returns error', async () => {
    await expect(
      chat(OLLAMA_URL, {
        model: 'nonexistent-model-xyz-999',
        messages: [{ role: 'user', content: 'test' }],
      })
    ).rejects.toThrow();
  }, 15000);

  it('embed with multiple inputs returns multiple embeddings', async () => {
    const response = await embed(OLLAMA_URL, {
      model: EMBEDDING_MODEL,
      input: ['Hello', 'World'],
    });

    expect(response.embeddings.length).toBe(2);
    expect(response.embeddings[0].length).toBe(response.embeddings[1].length);
  }, 30000);

  it('chat response includes model name', async () => {
    const response = await chat(OLLAMA_URL, {
      model: MODEL,
      messages: [{ role: 'user', content: 'Say ok' }],
      options: { temperature: 0, num_predict: 5 },
    });

    expect(response.model).toContain(MODEL.split(':')[0]);
  }, 30000);
});
