import { AppError } from '@/lib/errors';
import { loadSettings } from '@/lib/config/settings';
import {
  findCalibrationProfile,
  getMachineFingerprint,
} from '@/lib/tasks/calibration-profile';
import { runQuickProbe } from '@/lib/tasks/quick-probe';
import {
  CalibrationProfile,
  CalibrationProfileStatus,
  EffectiveRuntimeConfig,
  QuickProbeResult,
  RuntimeConfigSource,
  TaskBootstrapOptions,
  TaskBootstrapResult,
  TaskWorkloadType,
} from '@/types/task';

const DEFAULT_NUM_CTX = 4096;
const PROFILE_STALE_AFTER_DAYS = 7;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function getProfileStatus(profile: CalibrationProfile | null): CalibrationProfileStatus {
  if (!profile) return 'missing';
  const measuredAt = new Date(profile.measuredAt).getTime();
  const ageMs = Date.now() - measuredAt;
  return ageMs > PROFILE_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000 ? 'stale' : 'fresh';
}

function clampPositive(value: number, fallback: number): number {
  return isPositiveInteger(value) ? value : fallback;
}

function getRequiredDistinctModels(
  chatModel: string,
  embeddingModel: string,
  imageModel: string,
  includeImageModel: boolean
): number {
  const models = new Set<string>([chatModel]);
  if (embeddingModel && embeddingModel !== chatModel) {
    models.add(embeddingModel);
  }
  if (includeImageModel && imageModel && imageModel !== chatModel) {
    models.add(imageModel);
  }
  return models.size;
}

function deriveMaxConcurrentSubagents(numParallel: number): number {
  return Math.max(1, numParallel - 1);
}

function deriveSource(
  status: CalibrationProfileStatus,
  quickProbeAdjusted: boolean
): RuntimeConfigSource {
  if (quickProbeAdjusted) return 'quick-probe-adjusted';
  if (status === 'fresh') return 'calibration-profile';
  return 'safe-default';
}

export async function bootstrapTaskMode(
  options: TaskBootstrapOptions = {}
): Promise<TaskBootstrapResult> {
  const settings = await loadSettings();
  const model = options.model ?? settings.ollamaModel;
  const numCtx = clampPositive(options.numCtx ?? DEFAULT_NUM_CTX, DEFAULT_NUM_CTX);
  const workloadType: TaskWorkloadType = options.workloadType ?? 'mixed-task-mode';
  const includeImageModel = options.includeImageModel ?? false;

  const serverNumParallel = clampPositive(settings.numParallel, 1);
  const serverMaxLoadedModels = clampPositive(settings.maxLoadedModels, 1);
  const machineFingerprint = getMachineFingerprint();
  const profile = await findCalibrationProfile({
    machineFingerprint,
    model,
    numCtx,
    workloadType,
  });
  const calibrationStatus = getProfileStatus(profile);
  const requiredDistinctModels = getRequiredDistinctModels(
    model,
    settings.embeddingModel,
    settings.imageModel,
    includeImageModel
  );
  const desiredMaxLoadedModels = Math.max(requiredDistinctModels, 1);
  const effectiveMaxLoadedModels = Math.min(
    serverMaxLoadedModels,
    desiredMaxLoadedModels
  );

  const warnings: string[] = [];
  if (effectiveMaxLoadedModels < requiredDistinctModels) {
    warnings.push(
      `현재 maxLoadedModels(${serverMaxLoadedModels})가 TASK 모드 권장 동시 모델 수(${requiredDistinctModels})보다 낮습니다. 모델 스왑이 발생할 수 있습니다.`
    );
  }

  let candidateNumParallel = 1;
  if (profile?.recommendedNumParallel) {
    candidateNumParallel = profile.recommendedNumParallel;
    if (calibrationStatus === 'stale') {
      candidateNumParallel = Math.max(1, candidateNumParallel - 1);
      warnings.push('저장된 calibration profile이 오래되어 보수적으로 한 단계 낮춰 시작합니다.');
    }
  } else {
    warnings.push('저장된 calibration profile이 없어 safe default로 시작합니다.');
  }
  candidateNumParallel = Math.min(candidateNumParallel, serverNumParallel);

  let probeResult: QuickProbeResult | null = null;
  let acceptedNumParallel = candidateNumParallel;
  let quickProbeAdjusted = false;

  while (acceptedNumParallel >= 1) {
    probeResult = await runQuickProbe({
      baseUrl: settings.ollamaUrl,
      model,
      numCtx,
      workloadType,
      candidateNumParallel: acceptedNumParallel,
    });

    if (probeResult.ok && (probeResult.warmLoad || acceptedNumParallel === 1)) {
      break;
    }

    if (!probeResult.warmLoad && acceptedNumParallel > 1) {
      warnings.push(
        `QuickProbe에서 모델 reload 징후가 감지되어 병렬값을 ${acceptedNumParallel - 1}로 낮춥니다.`
      );
    } else if (!probeResult.ok && acceptedNumParallel > 1) {
      warnings.push(
        `QuickProbe 실패(${probeResult.reason ?? 'unknown'})로 병렬값을 ${acceptedNumParallel - 1}로 낮춥니다.`
      );
    }

    if (acceptedNumParallel === 1) {
      if (!probeResult.ok) {
        throw new AppError(
          `QuickProbe failed at safe default: ${probeResult.reason ?? 'unknown error'}`,
          503,
          'TASK_BOOTSTRAP_FAILED'
        );
      }
      break;
    }

    acceptedNumParallel -= 1;
    quickProbeAdjusted = true;
  }

  if (!probeResult) {
    throw new AppError('QuickProbe did not execute.', 500, 'TASK_BOOTSTRAP_FAILED');
  }

  const runtime: EffectiveRuntimeConfig = {
    model,
    numCtx,
    workloadType,
    effectiveNumParallel: acceptedNumParallel,
    effectiveMaxConcurrentSubagents: deriveMaxConcurrentSubagents(acceptedNumParallel),
    effectiveMaxLoadedModels,
    requiredDistinctModels,
    source: deriveSource(calibrationStatus, quickProbeAdjusted),
  };

  return {
    model,
    numCtx,
    workloadType,
    runtime,
    calibration: {
      status: calibrationStatus,
      scheduleCalibration: calibrationStatus !== 'fresh',
      machineFingerprint,
      profileId: profile?.id,
      measuredAt: profile?.measuredAt,
    },
    quickProbe: probeResult,
    serverCaps: {
      numParallel: serverNumParallel,
      maxLoadedModels: serverMaxLoadedModels,
    },
    warnings,
  };
}
