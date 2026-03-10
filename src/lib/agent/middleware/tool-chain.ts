import { ToolMiddleware } from './types';
import { logger } from '@/lib/logger';

interface BeforeResult {
  toolName: string;
  args: Record<string, unknown>;
  skip?: boolean;
  skipReason?: string;
}

export class ToolMiddlewareChain {
  constructor(private middlewares: ToolMiddleware[]) {}

  async runBeforeExecute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<BeforeResult> {
    let current: BeforeResult = { toolName, args };
    for (const mw of this.middlewares) {
      if (!mw.beforeExecute) continue;
      try {
        current = await mw.beforeExecute(current.toolName, current.args);
        if (current.skip) return current;
      } catch (err) {
        logger.warn('TOOL_MIDDLEWARE', `${mw.name}.beforeExecute 실패`, err);
      }
    }
    return current;
  }

  async runAfterExecute(
    toolName: string,
    args: Record<string, unknown>,
    result: { success: boolean; output: string }
  ): Promise<{ success: boolean; output: string }> {
    let current = result;
    for (const mw of this.middlewares) {
      if (!mw.afterExecute) continue;
      try {
        current = await mw.afterExecute(toolName, args, current);
      } catch (err) {
        logger.warn('TOOL_MIDDLEWARE', `${mw.name}.afterExecute 실패`, err);
      }
    }
    return current;
  }
}
