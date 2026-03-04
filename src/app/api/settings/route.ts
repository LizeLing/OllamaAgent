import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { resetTools } from '@/lib/tools/init';

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await saveSettings(body);
    resetTools(); // Force re-initialization with new settings
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}
