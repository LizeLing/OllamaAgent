import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { McpServerConfig } from '@/types/settings';
import { testConnection } from '@/lib/mcp/client';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json({ servers: settings.mcpServers || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Test connection endpoint
  if (body.action === 'test') {
    const ok = await testConnection(body.url);
    return NextResponse.json({ connected: ok });
  }

  const settings = await loadSettings();
  const newServer: McpServerConfig = {
    id: uuidv4(),
    name: body.name,
    url: body.url,
    transport: body.transport || 'sse',
    command: body.command,
    args: body.args,
    enabled: true,
  };

  const mcpServers = [...(settings.mcpServers || []), newServer];
  await saveSettings({ mcpServers });

  return NextResponse.json({ server: newServer });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const settings = await loadSettings();
  const mcpServers = (settings.mcpServers || []).map((s) =>
    s.id === body.id ? { ...s, ...body } : s
  );
  await saveSettings({ mcpServers });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const settings = await loadSettings();
  const mcpServers = (settings.mcpServers || []).filter((s) => s.id !== id);
  await saveSettings({ mcpServers });
  return NextResponse.json({ success: true });
}
