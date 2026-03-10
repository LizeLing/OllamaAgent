import { describe, it, expect } from 'vitest';
import { ToolMiddlewareChain } from '../tool-chain';
import { ToolMiddleware } from '../types';

describe('ToolMiddlewareChain', () => {
  it('beforeExecute를 순서대로 실행한다', async () => {
    const mw: ToolMiddleware = {
      name: 'logger',
      async beforeExecute(toolName, args) {
        return { toolName, args: { ...args, logged: true } };
      },
    };
    const chain = new ToolMiddlewareChain([mw]);
    const result = await chain.runBeforeExecute('test_tool', { key: 'value' });
    expect(result.args.logged).toBe(true);
    expect(result.skip).toBeUndefined();
  });

  it('skip: true이면 실행을 건너뛴다', async () => {
    const mw: ToolMiddleware = {
      name: 'blocker',
      async beforeExecute(toolName, args) {
        return { toolName, args, skip: true, skipReason: 'blocked' };
      },
    };
    const chain = new ToolMiddlewareChain([mw]);
    const result = await chain.runBeforeExecute('test_tool', {});
    expect(result.skip).toBe(true);
  });

  it('afterExecute에서 결과를 변환할 수 있다', async () => {
    const mw: ToolMiddleware = {
      name: 'truncator',
      async afterExecute(_name, _args, result) {
        return { ...result, output: result.output.slice(0, 10) };
      },
    };
    const chain = new ToolMiddlewareChain([mw]);
    const result = await chain.runAfterExecute('t', {}, { success: true, output: 'a'.repeat(100) });
    expect(result.output).toHaveLength(10);
  });
});
