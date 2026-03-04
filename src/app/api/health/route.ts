import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { checkHealth } from '@/lib/ollama/client';
import { HealthStatus } from '@/types/api';

export async function GET() {
  const settings = await loadSettings();

  const [ollama, searxng, docker] = await Promise.all([
    checkHealth(settings.ollamaUrl),
    checkSearxng(settings.searxngUrl),
    checkDocker(),
  ]);

  // Check embedding model by attempting a small embed
  let embedding = false;
  if (ollama) {
    try {
      const res = await fetch(`${settings.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.embeddingModel, input: 'test' }),
        signal: AbortSignal.timeout(5000),
      });
      embedding = res.ok;
    } catch {
      embedding = false;
    }
  }

  const status: HealthStatus = {
    ollama,
    searxng,
    docker,
    embedding,
    stt: false, // Can't easily check without audio
    tts: false, // Can't easily check without running python
  };

  return NextResponse.json(status);
}

async function checkSearxng(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkDocker(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:2375/_ping', { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    // Try unix socket via Docker SDK (already imported in code-executor)
    try {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      await docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}
