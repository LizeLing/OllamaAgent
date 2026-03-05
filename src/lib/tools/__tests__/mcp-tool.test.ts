import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mcp/client', () => ({
  callTool: vi.fn(),
}));

import { McpTool } from '../mcp-tool';
import { callTool } from '@/lib/mcp/client';
import { McpToolSchema } from '@/lib/mcp/types';

const mockCallTool = vi.mocked(callTool);

const schema: McpToolSchema = {
  name: 'test_tool',
  description: 'A test tool',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input text' },
    },
    required: ['input'],
  },
};

describe('McpTool', () => {
  beforeEach(() => { mockCallTool.mockReset(); });

  it('JSON-RPC 요청을 올바르게 구성한다', async () => {
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'result' }],
    });
    const tool = new McpTool('http://localhost:3000', schema);
    await tool.execute({ input: 'hello' });

    expect(mockCallTool).toHaveBeenCalledWith('http://localhost:3000', 'test_tool', { input: 'hello' });
  });

  it('성공 응답을 파싱한다', async () => {
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'result data' }],
    });
    const tool = new McpTool('http://localhost:3000', schema);
    const result = await tool.execute({ input: 'test' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('result data');
  });

  it('에러 응답을 처리한다 (isError: true)', async () => {
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'error occurred' }],
      isError: true,
    });
    const tool = new McpTool('http://localhost:3000', schema);
    const result = await tool.execute({ input: 'test' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('error occurred');
  });

  it('출력을 5000자로 truncate한다', async () => {
    const longText = 'x'.repeat(6000);
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: longText }],
    });
    const tool = new McpTool('http://localhost:3000', schema);
    const result = await tool.execute({ input: 'test' });

    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(5000);
  });

  it('definition name에 mcp_ prefix가 붙는다', () => {
    const tool = new McpTool('http://localhost:3000', schema);
    expect(tool.definition.name).toBe('mcp_test_tool');
    expect(tool.definition.parameters).toHaveLength(1);
    expect(tool.definition.parameters[0].name).toBe('input');
  });
});
