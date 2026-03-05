import { describe, it, expect, beforeEach } from 'vitest';
import { toolRegistry } from '../registry';
import { BaseTool } from '../base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';

class MockTool extends BaseTool {
  definition: ToolDefinition;

  constructor(name: string) {
    super();
    this.definition = {
      name,
      description: `Mock ${name}`,
      parameters: [],
    };
  }

  async execute(): Promise<ToolResult> {
    return { success: true, output: 'ok' };
  }
}

describe('ToolRegistry', () => {
  beforeEach(() => {
    // Clear the registry between tests
    toolRegistry.replaceAll([]);
  });

  it('registers and retrieves a tool', () => {
    const tool = new MockTool('test_tool');
    toolRegistry.register(tool);
    expect(toolRegistry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unregistered tool', () => {
    expect(toolRegistry.get('missing')).toBeUndefined();
  });

  it('getAll returns all registered tools via getDefinitions', () => {
    toolRegistry.register(new MockTool('a'));
    toolRegistry.register(new MockTool('b'));
    expect(toolRegistry.getDefinitions()).toHaveLength(2);
  });

  it('replaceAll atomically swaps tools', () => {
    toolRegistry.register(new MockTool('old'));
    toolRegistry.replaceAll([new MockTool('new1'), new MockTool('new2')]);
    expect(toolRegistry.get('old')).toBeUndefined();
    expect(toolRegistry.get('new1')).toBeDefined();
    expect(toolRegistry.get('new2')).toBeDefined();
  });
});
