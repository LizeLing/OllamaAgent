import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';

export async function GET() {
  try {
    const settings = await loadSettings();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="ollamaagent-settings.json"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to export settings' }, { status: 500 });
  }
}
