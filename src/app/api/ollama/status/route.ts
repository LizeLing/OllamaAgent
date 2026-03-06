import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';

export async function GET() {
  try {
    const settings = await loadSettings();
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';

    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return NextResponse.json({ running: false });
    }

    return NextResponse.json({
      running: true,
      numParallel: settings.numParallel || 1,
      maxLoadedModels: settings.maxLoadedModels || 1,
    });
  } catch {
    return NextResponse.json({ running: false });
  }
}
