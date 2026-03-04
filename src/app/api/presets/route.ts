import { NextRequest, NextResponse } from 'next/server';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const presets = await listPresets();
  return NextResponse.json({ presets });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const preset = {
    id: uuidv4(),
    name: body.name,
    systemPrompt: body.systemPrompt,
    enabledTools: body.enabledTools || [],
    model: body.model,
  };
  await savePreset(preset);
  return NextResponse.json({ preset });
}
