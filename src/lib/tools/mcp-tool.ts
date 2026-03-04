import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { McpToolSchema } from '@/lib/mcp/types';
import { callTool } from '@/lib/mcp/client';

export class McpTool extends BaseTool {
  definition: ToolDefinition;
  private serverUrl: string;
  private mcpToolName: string;

  constructor(serverUrl: string, schema: McpToolSchema) {
    super();
    this.serverUrl = serverUrl;
    this.mcpToolName = schema.name;
    this.definition = {
      name: `mcp_${schema.name}`,
      description: schema.description,
      parameters: Object.entries(schema.inputSchema.properties || {}).map(([name, prop]) => ({
        name,
        type: prop.type,
        description: prop.description || '',
        required: schema.inputSchema.required?.includes(name) || false,
      })),
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await callTool(this.serverUrl, this.mcpToolName, args);
      if (result.isError) {
        return this.error(result.content.map((c) => c.text || '').join('\n'));
      }
      return this.success(result.content.map((c) => c.text || '').join('\n').slice(0, 5000));
    } catch (err) {
      return this.error(err instanceof Error ? err.message : 'MCP call failed');
    }
  }
}
