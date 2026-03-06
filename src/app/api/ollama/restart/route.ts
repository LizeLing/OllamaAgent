import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { killOllama, startOllama } from '@/lib/ollama/process';

export async function POST() {
  try {
    const settings = await loadSettings();
    const numParallel = settings.numParallel || 1;
    const maxLoadedModels = settings.maxLoadedModels || 1;

    // Stop existing Ollama process
    try {
      killOllama();
    } catch {
      // Process may not exist — ignore
    }

    // Wait briefly for process to terminate
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start Ollama with configured environment variables
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    env.OLLAMA_NUM_PARALLEL = String(numParallel);
    env.OLLAMA_MAX_LOADED_MODELS = String(maxLoadedModels);

    startOllama(env);

    // Wait for Ollama to become ready (up to 10 seconds)
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // Not ready yet
      }
    }

    if (!ready) {
      return NextResponse.json(
        { error: 'Ollama 서버가 시작되었지만 응답하지 않습니다. 수동으로 확인해주세요.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      numParallel,
      maxLoadedModels,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Ollama 재시작 실패: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
