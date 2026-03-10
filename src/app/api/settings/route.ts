import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { withErrorHandler } from '@/lib/api/handler';
import { settingsUpdateSchema } from '@/lib/api/schemas';
import { Settings } from '@/types/settings';

export const GET = withErrorHandler('SETTINGS', async () => {
  const settings = await loadSettings();
  return NextResponse.json(settings);
});

export const PUT = withErrorHandler('SETTINGS', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = settingsUpdateSchema.parse(body) as Partial<Settings>;
  const updated = await saveSettings(parsed);
  return NextResponse.json(updated);
});
