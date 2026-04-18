import { describe, it, expect } from 'vitest';
import type { AgentMiddleware, ToolMiddleware } from '../types';

describe('Middleware Types', () => {
  it('AgentMiddleware는 name과 선택적 훅을 가진다', () => {
    const mw: AgentMiddleware = { name: 'test' };
    expect(mw.name).toBe('test');
    expect(mw.beforeAgent).toBeUndefined();
  });

  it('ToolMiddleware는 name과 선택적 훅을 가진다', () => {
    const mw: ToolMiddleware = { name: 'test' };
    expect(mw.name).toBe('test');
    expect(mw.beforeExecute).toBeUndefined();
  });
});
