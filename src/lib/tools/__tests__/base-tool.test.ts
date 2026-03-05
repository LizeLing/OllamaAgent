import { describe, it, expect } from 'vitest';
import { BaseTool } from '../base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

class TestTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'test',
    description: 'test tool',
    parameters: [],
  };

  async execute(): Promise<ToolResult> {
    return this.success('ok');
  }

  // Expose protected methods for testing
  testSuccess(output: string) { return this.success(output); }
  testError(message: string) { return this.error(message); }
}

describe('BaseTool', () => {
  const tool = new TestTool();

  it('success()는 {success: true, output: ...}을 반환한다', () => {
    const result = tool.testSuccess('hello world');
    expect(result).toEqual({ success: true, output: 'hello world' });
  });

  it('error()는 {success: false, output: "Error: ..."}을 반환한다', () => {
    const result = tool.testError('something went wrong');
    expect(result).toEqual({ success: false, output: 'Error: something went wrong' });
  });

  it('definition이 올바르게 설정된다', () => {
    expect(tool.definition.name).toBe('test');
    expect(tool.definition.description).toBe('test tool');
  });
});
