import { logger } from '@/lib/logger';
import { OllamaChatRequest, OllamaChatResponse } from '@/lib/ollama/types';
import { QuickProbeOptions, QuickProbeResult, TaskWorkloadType } from '@/types/task';

const DEFAULT_TIMEOUT_MS = 15000;
const KEEP_ALIVE = '10m';
const MAX_WARM_LOAD_DURATION_MS = 1000;

interface ProbeCallResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  loadDurationMs: number;
  reason?: string;
}

function getProbePrompt(workloadType: TaskWorkloadType): string {
  switch (workloadType) {
    case 'main-agent':
      return 'Reply with exactly: TASK MODE READY';
    case 'worker-agent':
      return 'Reply with exactly: WORKER READY';
    case 'mixed-task-mode':
    default:
      return 'Reply with exactly: MIXED TASK READY';
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

async function sendProbeCall(
  baseUrl: string,
  request: OllamaChatRequest,
  timeoutMs: number
): Promise<ProbeCallResult> {
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        loadDurationMs: 0,
        reason: `http_${response.status}`,
      };
    }

    const body = (await response.json()) as OllamaChatResponse;
    return {
      ok: Boolean(body.done),
      latencyMs,
      loadDurationMs: Math.round((body.load_duration ?? 0) / 1_000_000),
      reason: body.done ? undefined : 'incomplete_response',
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      loadDurationMs: 0,
      reason: error instanceof Error ? error.message : 'request_failed',
    };
  }
}

export async function runQuickProbe(
  options: QuickProbeOptions
): Promise<QuickProbeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const request: OllamaChatRequest = {
    model: options.model,
    keep_alive: KEEP_ALIVE,
    messages: [{ role: 'user', content: getProbePrompt(options.workloadType) }],
    options: {
      temperature: 0,
      top_p: 0.1,
      num_predict: 16,
      num_ctx: options.numCtx,
    },
  };

  const warmup = await sendProbeCall(options.baseUrl, request, timeoutMs);
  if (!warmup.ok) {
    logger.warn('TASK_QUICK_PROBE', 'Warm-up request failed', warmup);
    return {
      ok: false,
      attemptedNumParallel: options.candidateNumParallel,
      successfulRequests: 0,
      failedRequests: 1,
      averageLatencyMs: warmup.latencyMs,
      p95LatencyMs: warmup.latencyMs,
      warmLoad: false,
      maxLoadDurationMs: warmup.loadDurationMs,
      reason: warmup.reason ?? 'warmup_failed',
    };
  }

  const probeCalls = await Promise.all(
    Array.from({ length: options.candidateNumParallel }, () =>
      sendProbeCall(options.baseUrl, request, timeoutMs)
    )
  );

  const failedCalls = probeCalls.filter((call) => !call.ok);
  const latencies = probeCalls.map((call) => call.latencyMs);
  const loadDurations = probeCalls.map((call) => call.loadDurationMs);
  const warmLoad = loadDurations.every(
    (loadDurationMs) => loadDurationMs <= MAX_WARM_LOAD_DURATION_MS
  );

  return {
    ok: failedCalls.length === 0,
    attemptedNumParallel: options.candidateNumParallel,
    successfulRequests: probeCalls.length - failedCalls.length,
    failedRequests: failedCalls.length,
    averageLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, current) => sum + current, 0) / latencies.length)
        : 0,
    p95LatencyMs: percentile(latencies, 95),
    warmLoad,
    maxLoadDurationMs: loadDurations.length > 0 ? Math.max(...loadDurations) : 0,
    reason: failedCalls[0]?.reason,
  };
}
