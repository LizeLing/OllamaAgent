import { AgentMiddleware, MiddlewareContext, ToolCallInfo } from './types';
import { logger } from '@/lib/logger';

/**
 * 서브에이전트 실행 제한 미들웨어
 *
 * 모델이 한 번에 요청하는 서브에이전트(delegate_to_subagent) 호출 수를
 * maxConcurrent 이하로 제한한다. 일반 도구 호출은 영향받지 않는다.
 */
export class SubagentLimitMiddleware implements AgentMiddleware {
  name = 'subagent-limit';

  constructor(private maxConcurrent: number = 3) {}

  async afterModel(
    _ctx: MiddlewareContext,
    toolCalls: ToolCallInfo[]
  ): Promise<ToolCallInfo[]> {
    const subagentCalls: ToolCallInfo[] = [];
    const otherCalls: ToolCallInfo[] = [];

    for (const tc of toolCalls) {
      if (tc.name === 'delegate_to_subagent') {
        subagentCalls.push(tc);
      } else {
        otherCalls.push(tc);
      }
    }

    if (subagentCalls.length > this.maxConcurrent) {
      logger.info(
        'MIDDLEWARE',
        `서브에이전트 호출 제한: ${subagentCalls.length} → ${this.maxConcurrent}`
      );
      return [...otherCalls, ...subagentCalls.slice(0, this.maxConcurrent)];
    }

    return toolCalls;
  }
}
