import { AgentMiddleware, MiddlewareContext } from './types';
import { chat } from '@/lib/ollama/client';
import { LIMITS } from '@/lib/config/timeouts';
import { logger } from '@/lib/logger';

/**
 * 컨텍스트 요약 미들웨어
 *
 * 대화 히스토리가 charThreshold를 초과하면 오래된 메시지를 Ollama로 요약하여
 * 컨텍스트 크기를 줄인다. 시스템 메시지와 최근 4개 메시지는 항상 보존된다.
 */
export class SummarizationMiddleware implements AgentMiddleware {
  name = 'summarization';

  constructor(private charThreshold: number = LIMITS.MAX_HISTORY_CHARS) {}

  async beforeAgent(ctx: MiddlewareContext): Promise<MiddlewareContext> {
    const totalChars = ctx.messages.reduce(
      (sum, m) => sum + m.content.length,
      0
    );
    if (totalChars <= this.charThreshold) return ctx;

    try {
      // 시스템 프롬프트와 최근 4개 메시지는 보존
      const systemMsg = ctx.messages[0];
      const recentMessages = ctx.messages.slice(-4);
      const oldMessages = ctx.messages.slice(1, -4);

      if (oldMessages.length < 2) return ctx;

      const oldText = oldMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const summaryResponse = await chat(ctx.config.ollamaUrl, {
        model: ctx.config.ollamaModel,
        messages: [
          {
            role: 'system',
            content:
              '이전 대화를 핵심 내용만 간결하게 요약하세요. 200자 이내로 작성하세요.',
          },
          { role: 'user', content: oldText.slice(0, 4000) },
        ],
        stream: false,
      });

      const summary = summaryResponse.message.content;
      const summaryMsg = {
        role: 'system' as const,
        content: `[이전 대화 요약] ${summary}`,
      };

      logger.info(
        'MIDDLEWARE',
        `컨텍스트 요약: ${oldMessages.length}개 메시지 → 1개 요약`
      );

      return {
        ...ctx,
        messages: [systemMsg, summaryMsg, ...recentMessages],
      };
    } catch (err) {
      logger.warn('MIDDLEWARE', '컨텍스트 요약 실패, 원본 유지', err);
      return ctx;
    }
  }
}
