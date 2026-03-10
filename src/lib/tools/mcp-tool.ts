import { BaseTool } from './base-tool';
import { ToolDefinition, ToolResult } from '@/lib/agent/types';
import { McpToolSchema } from '@/lib/mcp/types';
import { callTool } from '@/lib/mcp/client';
import { CircuitBreaker } from '@/lib/infra/circuit-breaker';

/** MCP 서버 URL별 Circuit Breaker 관리 */
const mcpBreakers = new Map<string, CircuitBreaker>();

/** 서버 URL에 대한 CircuitBreaker를 가져오거나 생성 */
function getMcpBreaker(serverUrl: string): CircuitBreaker {
  let breaker = mcpBreakers.get(serverUrl);
  if (!breaker) {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 15000,
      name: `mcp:${serverUrl}`,
    });
    mcpBreakers.set(serverUrl, breaker);
  }
  return breaker;
}

/** 테스트용: 모든 MCP Circuit Breaker 초기화 */
export function clearMcpBreakers(): void {
  mcpBreakers.clear();
}

/** 테스트용: MCP breaker Map 참조 */
export { mcpBreakers };

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
    const breaker = getMcpBreaker(this.serverUrl);
    try {
      const result = await breaker.execute(() =>
        callTool(this.serverUrl, this.mcpToolName, args)
      );
      if (result.isError) {
        return this.error(result.content.map((c) => c.text || '').join('\n'));
      }
      return this.success(result.content.map((c) => c.text || '').join('\n').slice(0, 5000));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MCP call failed';
      return this.error(message);
    }
  }
}
