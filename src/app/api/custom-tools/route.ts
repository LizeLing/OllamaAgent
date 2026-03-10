import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { CustomToolDef } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler } from '@/lib/api/handler';
import { createCustomToolSchema, deleteByIdSchema, isInternalUrl } from '@/lib/api/schemas';
import { AppError } from '@/lib/errors';

export const GET = withErrorHandler('CUSTOM_TOOLS', async () => {
  const settings = await loadSettings();
  return NextResponse.json({ customTools: settings.customTools || [] });
});

export const POST = withErrorHandler('CUSTOM_TOOLS', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = createCustomToolSchema.parse(body);

  // SSRF 방지: 내부 네트워크 URL 차단
  if (isInternalUrl(parsed.url)) {
    throw new AppError('내부 네트워크 URL은 허용되지 않습니다.', 400, 'SSRF_BLOCKED');
  }

  const settings = await loadSettings();

  const newTool: CustomToolDef = {
    id: uuidv4(),
    name: parsed.name,
    description: parsed.description || '',
    url: parsed.url,
    method: parsed.method,
    headers: parsed.headers,
    bodyTemplate: parsed.bodyTemplate,
    parameters: parsed.parameters,
  };

  const customTools = [...(settings.customTools || []), newTool];
  await saveSettings({ customTools });

  return NextResponse.json({ tool: newTool });
});

export const DELETE = withErrorHandler('CUSTOM_TOOLS', async (request: NextRequest) => {
  const body = await request.json();
  const { id } = deleteByIdSchema.parse(body);
  const settings = await loadSettings();
  const customTools = (settings.customTools || []).filter((t) => t.id !== id);
  await saveSettings({ customTools });
  return NextResponse.json({ success: true });
});
