import { ToolDefinition, ToolResult } from '@/lib/agent/types';

export abstract class BaseTool {
  abstract definition: ToolDefinition;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  protected success(output: string): ToolResult {
    return { success: true, output };
  }

  protected error(message: string): ToolResult {
    return { success: false, output: `Error: ${message}` };
  }
}
