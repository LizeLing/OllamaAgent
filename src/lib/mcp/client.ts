import { McpToolSchema, McpCallResult } from './types';

export async function listTools(serverUrl: string): Promise<McpToolSchema[]> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  return (data.result?.tools ?? []) as McpToolSchema[];
}

export async function callTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json();
  if (data.error) {
    return { content: [{ type: 'text', text: data.error.message }], isError: true };
  }
  return data.result as McpCallResult;
}

export async function testConnection(serverUrl: string): Promise<{ success: boolean; tools?: number; error?: string }> {
  try {
    const tools = await listTools(serverUrl);
    return { success: true, tools: tools.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' };
  }
}
