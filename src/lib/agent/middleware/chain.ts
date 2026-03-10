import { AgentMiddleware, MiddlewareContext, ToolCallInfo } from './types';
import { logger } from '@/lib/logger';

export class MiddlewareChain {
  constructor(private middlewares: AgentMiddleware[]) {}

  async runBeforeAgent(ctx: MiddlewareContext): Promise<MiddlewareContext> {
    let current = ctx;
    for (const mw of this.middlewares) {
      if (!mw.beforeAgent) continue;
      try {
        current = await mw.beforeAgent(current);
      } catch (err) {
        logger.warn('MIDDLEWARE', `${mw.name}.beforeAgent 실패`, err);
      }
    }
    return current;
  }

  async runAfterAgent(ctx: MiddlewareContext, response: string): Promise<void> {
    for (const mw of this.middlewares) {
      if (!mw.afterAgent) continue;
      try {
        await mw.afterAgent(ctx, response);
      } catch (err) {
        logger.warn('MIDDLEWARE', `${mw.name}.afterAgent 실패`, err);
      }
    }
  }

  async runBeforeModel(ctx: MiddlewareContext): Promise<MiddlewareContext> {
    let current = ctx;
    for (const mw of this.middlewares) {
      if (!mw.beforeModel) continue;
      try {
        current = await mw.beforeModel(current);
      } catch (err) {
        logger.warn('MIDDLEWARE', `${mw.name}.beforeModel 실패`, err);
      }
    }
    return current;
  }

  async runAfterModel(ctx: MiddlewareContext, toolCalls: ToolCallInfo[]): Promise<ToolCallInfo[]> {
    let current = toolCalls;
    for (const mw of this.middlewares) {
      if (!mw.afterModel) continue;
      try {
        current = await mw.afterModel(ctx, current);
      } catch (err) {
        logger.warn('MIDDLEWARE', `${mw.name}.afterModel 실패`, err);
      }
    }
    return current;
  }
}
