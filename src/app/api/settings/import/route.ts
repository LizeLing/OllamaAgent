import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { Settings } from '@/types/settings';

const ALLOWED_KEYS: (keyof Settings)[] = [
  'systemPrompt', 'maxIterations', 'allowedPaths', 'deniedPaths',
  'responseLanguage', 'ollamaUrl', 'ollamaModel', 'embeddingModel',
  'imageModel', 'searxngUrl', 'autoReadResponses', 'ttsVoice',
  'toolApprovalMode', 'customTools', 'mcpServers', 'modelOptions',
  'enabledTools',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid import data' }, { status: 400 });
    }

    const importedSettings = body.settings || body;
    const current = await loadSettings();

    const merged: Record<string, unknown> = { ...current };
    for (const key of ALLOWED_KEYS) {
      if (key in importedSettings) {
        merged[key] = importedSettings[key];
      }
    }

    await saveSettings(merged as unknown as Settings);
    const updated = await loadSettings();

    return NextResponse.json({ success: true, settings: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to import settings' }, { status: 500 });
  }
}
