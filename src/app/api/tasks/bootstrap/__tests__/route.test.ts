import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/tasks/bootstrap', () => ({
  bootstrapTaskMode: vi.fn(),
}));

import { POST } from '../route';
import { bootstrapTaskMode } from '@/lib/tasks/bootstrap';

const mockBootstrapTaskMode = vi.mocked(bootstrapTaskMode);

describe('API /api/tasks/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns bootstrap information for valid input', async () => {
    mockBootstrapTaskMode.mockResolvedValue({
      model: 'qwen3.5:9b',
      numCtx: 4096,
      workloadType: 'mixed-task-mode',
      runtime: {
        model: 'qwen3.5:9b',
        numCtx: 4096,
        workloadType: 'mixed-task-mode',
        effectiveNumParallel: 2,
        effectiveMaxConcurrentSubagents: 1,
        effectiveMaxLoadedModels: 2,
        requiredDistinctModels: 2,
        source: 'calibration-profile',
      },
      calibration: {
        status: 'fresh',
        scheduleCalibration: false,
        machineFingerprint: 'machine-1',
      },
      quickProbe: {
        ok: true,
        attemptedNumParallel: 2,
        successfulRequests: 2,
        failedRequests: 0,
        averageLatencyMs: 100,
        p95LatencyMs: 120,
        warmLoad: true,
        maxLoadDurationMs: 20,
      },
      serverCaps: {
        numParallel: 3,
        maxLoadedModels: 2,
      },
      warnings: [],
    } as never);

    const request = new NextRequest('http://localhost/api/tasks/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3.5:9b',
        numCtx: 4096,
        workloadType: 'mixed-task-mode',
      }),
    });

    const response = await POST(request, {} as never);
    const json = await response.json();

    expect(mockBootstrapTaskMode).toHaveBeenCalledWith({
      model: 'qwen3.5:9b',
      numCtx: 4096,
      workloadType: 'mixed-task-mode',
    });
    expect(response.status).toBe(200);
    expect(json.runtime.effectiveNumParallel).toBe(2);
  });

  it('returns 400 for invalid workloadType', async () => {
    const request = new NextRequest('http://localhost/api/tasks/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        workloadType: 'invalid-type',
      }),
    });

    const response = await POST(request, {} as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('INVALID_TASK_BOOTSTRAP');
  });
});
