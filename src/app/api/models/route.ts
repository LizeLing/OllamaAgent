import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';

export async function GET() {
  try {
    const settings = await loadSettings();
    const res = await fetch(`${settings.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ models: [] });
    }
    const data = await res.json();
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
