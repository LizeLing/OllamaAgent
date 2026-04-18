import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('@/lib/tasks/calibration-profile', () => ({
  findCalibrationProfile: vi.fn(),
  getMachineFingerprint: vi.fn(),
}));

vi.mock('@/lib/tasks/quick-probe', () => ({
  runQuickProbe: vi.fn(),
}));

import { loadSettings } from '@/lib/config/settings';
import {
  findCalibrationProfile,
  getMachineFingerprint,
} from '@/lib/tasks/calibration-profile';
import { runQuickProbe } from '@/lib/tasks/quick-probe';
import { bootstrapTaskMode } from '@/lib/tasks/bootstrap';
import { CalibrationProfile, QuickProbeResult } from '@/types/task';

const mockLoadSettings = vi.mocked(loadSettings);
const mockFindCalibrationProfile = vi.mocked(findCalibrationProfile);
const mockGetMachineFingerprint = vi.mocked(getMachineFingerprint);
const mockRunQuickProbe = vi.mocked(runQuickProbe);

const baseSettings = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3.5:9b',
  embeddingModel: 'qwen3-embedding:8b',
  imageModel: 'x/z-image-turbo:latest',
  numParallel: 3,
  maxLoadedModels: 2,
};

function makeProbeResult(overrides: Partial<QuickProbeResult> = {}): QuickProbeResult {
  return {
    ok: true,
    attemptedNumParallel: 1,
    successfulRequests: 1,
    failedRequests: 0,
    averageLatencyMs: 120,
    p95LatencyMs: 150,
    warmLoad: true,
    maxLoadDurationMs: 10,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<CalibrationProfile> = {}): CalibrationProfile {
  return {
    id: 'profile-1',
    machineFingerprint: 'machine-1',
    model: 'qwen3.5:9b',
    numCtx: 4096,
    workloadType: 'mixed-task-mode',
    recommendedNumParallel: 3,
    recommendedMaxConcurrentSubagents: 2,
    recommendedMaxLoadedModels: 2,
    measuredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('bootstrapTaskMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue(baseSettings as never);
    mockFindCalibrationProfile.mockResolvedValue(null);
    mockGetMachineFingerprint.mockReturnValue('machine-1');
    mockRunQuickProbe.mockResolvedValue(makeProbeResult());
  });

  it('uses safe defaults when no calibration profile exists', async () => {
    const result = await bootstrapTaskMode();

    expect(mockRunQuickProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateNumParallel: 1,
        workloadType: 'mixed-task-mode',
      })
    );
    expect(result.runtime.effectiveNumParallel).toBe(1);
    expect(result.runtime.source).toBe('safe-default');
    expect(result.calibration.status).toBe('missing');
    expect(result.calibration.scheduleCalibration).toBe(true);
    expect(result.warnings).toContain(
      '저장된 calibration profile이 없어 safe default로 시작합니다.'
    );
  });

  it('uses a fresh calibration profile and respects server caps', async () => {
    mockFindCalibrationProfile.mockResolvedValue(
      makeProfile({ recommendedNumParallel: 5 })
    );
    mockRunQuickProbe.mockResolvedValue(
      makeProbeResult({ attemptedNumParallel: 3, successfulRequests: 3 })
    );

    const result = await bootstrapTaskMode();

    expect(mockRunQuickProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateNumParallel: 3,
      })
    );
    expect(result.runtime.effectiveNumParallel).toBe(3);
    expect(result.runtime.effectiveMaxConcurrentSubagents).toBe(2);
    expect(result.runtime.source).toBe('calibration-profile');
    expect(result.calibration.status).toBe('fresh');
    expect(result.calibration.scheduleCalibration).toBe(false);
  });

  it('downgrades numParallel when quick probe fails', async () => {
    mockFindCalibrationProfile.mockResolvedValue(
      makeProfile({ recommendedNumParallel: 3 })
    );
    mockRunQuickProbe
      .mockResolvedValueOnce(
        makeProbeResult({
          ok: false,
          attemptedNumParallel: 3,
          failedRequests: 1,
          successfulRequests: 2,
          reason: 'http_503',
        })
      )
      .mockResolvedValueOnce(
        makeProbeResult({
          attemptedNumParallel: 2,
          successfulRequests: 2,
        })
      );

    const result = await bootstrapTaskMode();

    expect(mockRunQuickProbe).toHaveBeenCalledTimes(2);
    expect(result.runtime.effectiveNumParallel).toBe(2);
    expect(result.runtime.source).toBe('quick-probe-adjusted');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('병렬값을 2로 낮춥니다.'),
      ])
    );
  });
});
