import { OllamaChatStreamChunk } from './types';
import { chatStream } from './client';

export function createSSEStream(
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = chatStream(baseUrl, { model, messages });

        for await (const chunk of stream) {
          if (chunk.message?.content) {
            const event = formatSSE('token', { content: chunk.message.content });
            controller.enqueue(encoder.encode(event));
          }
          if (chunk.done) {
            controller.enqueue(encoder.encode(formatSSE('done', { iterations: 0 })));
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encoder.encode(formatSSE('error', { message: msg })));
      } finally {
        controller.close();
      }
    },
  });
}

export function formatSSE(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
