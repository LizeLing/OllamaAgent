import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { checkHealth } from '@/lib/ollama/client';
import { HealthStatus } from '@/types/api';
import { withErrorHandler } from '@/lib/api/handler';
import { TIMEOUTS } from '@/lib/config/timeouts';

export const GET = withErrorHandler('HEALTH', async () => {
  const settings = await loadSettings();

  const [ollama, searxng, docker] = await Promise.all([
    checkHealth(settings.ollamaUrl),
    checkSearxng(settings.searxngUrl),
    checkDocker(),
  ]);

  let embedding = false;
  if (ollama) {
    try {
      const res = await fetch(`${settings.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.embeddingModel, input: 'test' }),
        signal: AbortSignal.timeout(TIMEOUTS.EMBEDDING),
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
    stt: false,
    tts: false,
  };

  return NextResponse.json(status);
});

async function checkSearxng(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(TIMEOUTS.HEALTH_CHECK) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkDocker(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:2375/_ping', { signal: AbortSignal.timeout(TIMEOUTS.DOCKER_PING) });
    return res.ok;
  } catch {
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
