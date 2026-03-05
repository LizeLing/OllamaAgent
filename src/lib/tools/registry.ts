import { BaseTool } from './base-tool';
import { ToolResult, ToolDefinition } from '@/lib/agent/types';
import { OllamaTool } from '@/lib/ollama/types';

class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  clear(): void {
    this.tools.clear();
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, output: `Tool execution failed: ${msg}` };
    }
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Convert tool definitions to Ollama native tool format */
  toOllamaTools(enabledTools?: string[]): OllamaTool[] {
    let tools = Array.from(this.tools.values());

    // enabledTools가 비어있지 않으면 필터링
    if (enabledTools && enabledTools.length > 0) {
      tools = tools.filter((t) => enabledTools.includes(t.definition.name));
    }

    return tools.map((tool) => {
      const def = tool.definition;
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];

      for (const param of def.parameters) {
        properties[param.name] = {
          type: param.type,
          description: param.description,
        };
        if (param.required) {
          required.push(param.name);
        }
      }

      return {
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: {
            type: 'object' as const,
            properties,
            required,
          },
        },
      };
    });
  }
}

export const toolRegistry = new ToolRegistry();
