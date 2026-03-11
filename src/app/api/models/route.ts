import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';

interface OllamaLoadedModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at: string;
  details: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

export async function GET() {
  try {
    const settings = await loadSettings();
    const [tagsRes, psRes] = await Promise.all([
      fetch(`${settings.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${settings.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    const models: string[] = [];
    if (tagsRes.ok) {
      const data = await tagsRes.json();
      for (const m of data.models || []) {
        models.push(m.name);
      }
    }

    const loaded: OllamaLoadedModel[] = [];
    if (psRes?.ok) {
      const data = await psRes.json();
      for (const m of data.models || []) {
        loaded.push(m);
      }
    }

    // 각 모델의 context length 조회 (병렬, 개별 실패 허용)
    const modelInfo: Record<string, { contextLength: number }> = {};
    const showResults = await Promise.allSettled(
      models.map(async (name) => {
        const res = await fetch(`${settings.ollamaUrl}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: name }),
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return null;
        const info = await res.json();
        const ctxKey = Object.keys(info.model_info || {}).find(
          (k) => k.endsWith('.context_length')
        );
        const contextLength = ctxKey ? info.model_info[ctxKey] : null;
        return { name, contextLength };
      })
    );
    for (const r of showResults) {
      if (r.status === 'fulfilled' && r.value?.contextLength) {
        modelInfo[r.value.name] = { contextLength: r.value.contextLength };
      }
    }

    return NextResponse.json({ models, loaded, modelInfo });
  } catch {
    return NextResponse.json({ models: [], loaded: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { model, action } = await request.json();
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    const settings = await loadSettings();
    const keepAlive = action === 'unload' ? 0 : '30m';

    const res = await fetch(`${settings.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: keepAlive }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    return NextResponse.json({ success: true, model, action: action || 'load' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
