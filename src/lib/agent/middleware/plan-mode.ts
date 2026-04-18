import { AgentMiddleware, MiddlewareContext, ToolCallInfo } from './types';
import { PLAN_MODE_BLOCKED_TOOLS } from '@/types/chat';
import { logger } from '@/lib/logger';

/**
 * Plan 모드 미들웨어.
 *
 * planMode=true일 때 쓰기/실행 계열 도구 호출이 모델에서 leak 되는 경우를 방어한다.
 * agent-loop.ts의 `toOllamaTools` 단계에서 1차 필터링이 이미 수행되지만,
 * 일부 모델이 미등록 도구 이름을 호출하거나 custom destructive tool이 남는 경우를 위해
 * afterModel 단계에서 한 번 더 걸러낸다.
 *
 * 또한 plan 모드임을 알려주는 system 메시지를 beforeAgent에서 주입하여,
 * 모델이 plan 텍스트만 내놓도록 유도한다.
 */
export class PlanModeMiddleware implements AgentMiddleware {
  name = 'plan-mode';

  constructor(private extraBlockedTools: string[] = []) {}

  async beforeAgent(ctx: MiddlewareContext): Promise<MiddlewareContext> {
    if (!ctx.config.planMode) return ctx;

    const blocked = this.getBlockedSet(ctx);
    const blockedList = Array.from(blocked).join(', ') || '(없음)';

    const planInstruction =
      '\n\n## Plan 모드 활성화\n' +
      '현재 Plan 모드입니다. 파일 쓰기, 코드 실행, 이미지 생성 등 부작용이 있는 도구는 사용할 수 없습니다.\n' +
      `차단된 도구: ${blockedList}\n` +
      '사용자 요청에 대한 실행 계획(Plan)을 아래 형식으로 한국어 Markdown으로 작성하세요:\n' +
      '1. 목표 요약\n' +
      '2. 주요 단계 (번호 목록)\n' +
      '3. 영향 범위 / 위험 요인\n' +
      '4. 승인 후 수행할 작업 목록\n' +
      '실제 파일을 수정하거나 명령을 실행하지 마세요. 읽기·검색 도구는 허용됩니다.';

    const messages = [...ctx.messages];
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        ...messages[0],
        content: messages[0].content + planInstruction,
      };
    } else {
      messages.unshift({ role: 'system', content: planInstruction });
    }

    return { ...ctx, messages };
  }

  async afterModel(
    ctx: MiddlewareContext,
    toolCalls: ToolCallInfo[],
  ): Promise<ToolCallInfo[]> {
    if (!ctx.config.planMode) return toolCalls;
    if (toolCalls.length === 0) return toolCalls;

    const blocked = this.getBlockedSet(ctx);
    const filtered = toolCalls.filter((tc) => !blocked.has(tc.name));

    if (filtered.length !== toolCalls.length) {
      const dropped = toolCalls
        .filter((tc) => blocked.has(tc.name))
        .map((tc) => tc.name);
      logger.info(
        'MIDDLEWARE',
        `Plan 모드: 차단된 도구 호출 제거 (${dropped.join(', ')})`,
      );
    }

    return filtered;
  }

  private getBlockedSet(ctx: MiddlewareContext): Set<string> {
    const fromConfig = ctx.config.planBlockedTools ?? [];
    return new Set<string>([
      ...PLAN_MODE_BLOCKED_TOOLS,
      ...this.extraBlockedTools,
      ...fromConfig,
    ]);
  }
}
