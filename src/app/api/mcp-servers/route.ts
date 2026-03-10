import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { McpServerConfig } from '@/types/settings';
import { testConnection } from '@/lib/mcp/client';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler } from '@/lib/api/handler';
import { createMcpServerSchema, deleteByIdSchema, isInternalUrl } from '@/lib/api/schemas';
import { AppError } from '@/lib/errors';

export const GET = withErrorHandler('MCP_SERVERS', async () => {
  const settings = await loadSettings();
  return NextResponse.json({ servers: settings.mcpServers || [] });
});

export const POST = withErrorHandler('MCP_SERVERS', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = createMcpServerSchema.parse(body);

  // SSRF 방지: 내부 네트워크 URL 차단 (stdio 전송은 제외)
  if (parsed.url && parsed.transport !== 'stdio' && isInternalUrl(parsed.url)) {
    throw new AppError('내부 네트워크 URL은 허용되지 않습니다.', 400, 'SSRF_BLOCKED');
  }

  if (parsed.action === 'test') {
    const ok = await testConnection(parsed.url || '');
    return NextResponse.json({ connected: ok });
  }

  const settings = await loadSettings();
  const newServer: McpServerConfig = {
    id: uuidv4(),
    name: parsed.name || '',
    url: parsed.url || '',
    transport: parsed.transport,
    command: parsed.command,
    args: parsed.args,
    enabled: true,
  };

  const mcpServers = [...(settings.mcpServers || []), newServer];
  await saveSettings({ mcpServers });

  return NextResponse.json({ server: newServer });
});

export const PUT = withErrorHandler('MCP_SERVERS', async (request: NextRequest) => {
  const body = await request.json();
  const settings = await loadSettings();
  const mcpServers = (settings.mcpServers || []).map((s) =>
    s.id === body.id ? { ...s, ...body } : s
  );
  await saveSettings({ mcpServers });
  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandler('MCP_SERVERS', async (request: NextRequest) => {
  const body = await request.json();
  const { id } = deleteByIdSchema.parse(body);
  const settings = await loadSettings();
  const mcpServers = (settings.mcpServers || []).filter((s) => s.id !== id);
  await saveSettings({ mcpServers });
  return NextResponse.json({ success: true });
});
