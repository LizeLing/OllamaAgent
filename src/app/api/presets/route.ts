import { NextRequest, NextResponse } from 'next/server';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler } from '@/lib/api/handler';
import { createPresetSchema } from '@/lib/api/schemas';

export const GET = withErrorHandler('PRESETS', async () => {
  const presets = await listPresets();
  return NextResponse.json({ presets });
});

export const POST = withErrorHandler('PRESETS', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = createPresetSchema.parse(body);
  const preset = {
    id: uuidv4(),
    name: parsed.name,
    systemPrompt: parsed.systemPrompt,
    enabledTools: parsed.enabledTools,
    model: parsed.model,
  };
  await savePreset(preset);
  return NextResponse.json({ preset });
});
