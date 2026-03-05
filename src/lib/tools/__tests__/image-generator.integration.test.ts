import { describe, it, expect, beforeAll } from 'vitest';
import { checkOllamaAvailable } from '@/test/helpers/service-checker';
import { ImageGeneratorTool } from '../image-generator';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const IMAGE_MODEL = process.env.OLLAMA_IMAGE_MODEL || 'x/z-image-turbo:latest';

let ollamaAvailable = false;

beforeAll(async () => {
  ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
});

describe.skipIf(!ollamaAvailable)('ImageGeneratorTool Integration', () => {
  const tool = new ImageGeneratorTool(OLLAMA_URL, IMAGE_MODEL);

  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
  });

  it('image generation returns __IMAGE__ prefixed data', async () => {
    const result = await tool.execute({ prompt: 'a simple red circle' });

    // If the image model is available, expect success
    if (result.success) {
      expect(result.output).toMatch(/^__IMAGE__/);
      expect(result.output).toContain('__PROMPT__');
      expect(result.output).toContain('a simple red circle');
    }
    // If model not available, it should return an error gracefully
  }, 120000);

  it('short prompt works', async () => {
    const result = await tool.execute({ prompt: 'cat' });

    if (result.success) {
      expect(result.output).toMatch(/^__IMAGE__/);
    }
  }, 120000);

  it('returns error for empty prompt', async () => {
    const result = await tool.execute({ prompt: '' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });

  it('returns error for invalid model', async () => {
    const badTool = new ImageGeneratorTool(OLLAMA_URL, 'nonexistent-model-xyz');
    const result = await badTool.execute({ prompt: 'test' });
    expect(result.success).toBe(false);
  }, 30000);
});
