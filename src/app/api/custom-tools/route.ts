import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { CustomToolDef } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json({ customTools: settings.customTools || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const settings = await loadSettings();

  const newTool: CustomToolDef = {
    id: uuidv4(),
    name: body.name,
    description: body.description,
    url: body.url,
    method: body.method || 'GET',
    headers: body.headers,
    bodyTemplate: body.bodyTemplate,
    parameters: body.parameters || [],
  };

  const customTools = [...(settings.customTools || []), newTool];
  await saveSettings({ customTools });

  return NextResponse.json({ tool: newTool });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const settings = await loadSettings();
  const customTools = (settings.customTools || []).filter((t) => t.id !== id);
  await saveSettings({ customTools });
  return NextResponse.json({ success: true });
}
