import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { generate } from '@/lib/ollama/client';

export class ImageGeneratorTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'image_generate',
    description: '텍스트 설명을 기반으로 이미지를 생성합니다.',
    parameters: [
      { name: 'prompt', type: 'string', description: '이미지 설명 (영어 권장)', required: true },
    ],
  };

  constructor(
    private ollamaUrl: string,
    private imageModel: string
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const prompt = args.prompt as string;
    if (!prompt) return this.error('prompt is required');

    try {
      const response = await generate(this.ollamaUrl, {
        model: this.imageModel,
        prompt,
        stream: false,
      });

      // z-image-turbo uses singular 'image' field
      if (response.image && response.image.length > 100) {
        return {
          success: true,
          output: `__IMAGE__${response.image}__PROMPT__${prompt}`,
        };
      }

      if (response.images && response.images.length > 0) {
        return {
          success: true,
          output: `__IMAGE__${response.images[0]}__PROMPT__${prompt}`,
        };
      }

      // Fallback: check response field
      if (response.response && response.response.length > 100) {
        return {
          success: true,
          output: `__IMAGE__${response.response}__PROMPT__${prompt}`,
        };
      }

      return this.error('No image generated');
    } catch (err) {
      return this.error(`Image generation failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
