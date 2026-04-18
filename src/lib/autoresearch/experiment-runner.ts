import { AgentConfig } from '@/lib/agent/types';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { Settings } from '@/types/settings';
import { ExperimentConfig, ExperimentEntry, ExperimentProgress } from './types';
import { runBenchmark } from './benchmark';
import { getStrategies } from './strategies';
import { appendResult, loadResults } from './results-store';
import { logger } from '@/lib/logger';

const DEFAULT_CONFIG: ExperimentConfig = {
  maxExperiments: 20,
  improvementThreshold: 0.5,
};

/** 실행 중인 실험 상태 (in-memory singleton) */
let runningExperiment: {
  startedAt: number;
  currentExperiment: number;
  totalExperiments: number;
  currentStrategy: string;
  baselineScore: number;
  bestScore: number;
  abortController: AbortController;
} | null = null;

export function getRunningExperiment() {
  return runningExperiment
    ? {
        startedAt: runningExperiment.startedAt,
        currentExperiment: runningExperiment.currentExperiment,
        totalExperiments: runningExperiment.totalExperiments,
        currentStrategy: runningExperiment.currentStrategy,
        baselineScore: runningExperiment.baselineScore,
        bestScore: runningExperiment.bestScore,
        running: true,
      }
    : { running: false };
}

export function stopExperiment(): boolean {
  if (runningExperiment) {
    runningExperiment.abortController.abort();
    runningExperiment = null;
    return true;
  }
  return false;
}

/**
 * Settings → AgentConfig 변환 헬퍼
 */
function settingsToConfig(settings: Settings): AgentConfig {
  return {
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    maxIterations: settings.maxIterations,
    systemPrompt: settings.systemPrompt,
    allowedPaths: settings.allowedPaths,
    deniedPaths: settings.deniedPaths,
    toolApprovalMode: 'auto',
    modelOptions: {
      temperature: settings.modelOptions.temperature,
      top_p: settings.modelOptions.topP,
      num_predict: settings.modelOptions.numPredict,
    },
    enabledTools: settings.enabledTools,
    fallbackModels: settings.fallbackModels,
    thinkingMode: settings.thinkingMode,
    thinkingForToolCalls: settings.thinkingForToolCalls,
  };
}

/**
 * 실험 루프 실행 (autoresearch 핵심)
 *
 * 1. 현재 설정으로 baseline 벤치마크 실행
 * 2. 전략 하나씩 적용 → 벤치마크 → keep/discard
 * 3. keep이면 설정 영구 저장, discard면 원복
 * 4. 모든 전략 소진 또는 maxExperiments 도달 시 종료
 */
export async function* runExperimentLoop(
  config: ExperimentConfig = DEFAULT_CONFIG
): AsyncGenerator<ExperimentProgress> {
  if (runningExperiment) {
    yield { type: 'error', data: { message: '이미 실험이 실행 중입니다.' } };
    return;
  }

  const abortController = new AbortController();
  const signal = abortController.signal;

  try {
    // ── 1. 초기화 ──
    const settings = await loadSettings();
    const baseConfig = settingsToConfig(settings);

    yield { type: 'status', data: { message: '베이스라인 벤치마크를 실행합니다...' } };

    // ── 2. 베이스라인 측정 ──
    const baseline = await runBenchmark(undefined, config.caseIds, signal, (caseId, i, total) => {
      // progress callback은 generator 밖이므로 로깅만
      logger.info('AUTORESEARCH', `[baseline] ${i + 1}/${total}: ${caseId}`);
    });

    if (signal.aborted) {
      yield { type: 'error', data: { message: '실험이 중단되었습니다.' } };
      return;
    }

    const baselineEntry: ExperimentEntry = {
      id: `baseline-${Date.now()}`,
      timestamp: Date.now(),
      description: '베이스라인 (현재 설정)',
      changes: {},
      metrics: baseline,
      status: 'baseline',
    };
    await appendResult(baselineEntry);

    yield {
      type: 'experiment_end',
      data: {
        id: baselineEntry.id,
        description: baselineEntry.description,
        score: baseline.overallScore,
        status: 'baseline',
        categoryScores: baseline.categoryScores,
      },
    };

    // ── 3. 전략 탐색 ──
    const strategies = getStrategies(baseConfig);
    const filteredStrategies = config.strategyIds
      ? strategies.filter((s) => config.strategyIds!.includes(s.id))
      : strategies;

    const maxExp = Math.min(config.maxExperiments, filteredStrategies.length);
    let bestScore = baseline.overallScore;
    let currentConfig = baseConfig;
    const triedStrategies = new Set<string>();

    // 이전 실험에서 시도한 전략 로드
    const previousResults = await loadResults();
    for (const r of previousResults) {
      if (r.description) triedStrategies.add(r.description);
    }

    runningExperiment = {
      startedAt: Date.now(),
      currentExperiment: 0,
      totalExperiments: maxExp,
      currentStrategy: '',
      baselineScore: baseline.overallScore,
      bestScore,
      abortController,
    };

    for (let i = 0; i < maxExp; i++) {
      if (signal.aborted) break;

      const strategy = filteredStrategies[i];
      if (triedStrategies.has(strategy.description)) continue;

      runningExperiment.currentExperiment = i + 1;
      runningExperiment.currentStrategy = strategy.name;

      yield {
        type: 'experiment_start',
        data: {
          experiment: i + 1,
          total: maxExp,
          strategy: strategy.name,
          description: strategy.description,
        },
      };

      try {
        // 전략 적용
        const { overrides, changes } = strategy.apply(currentConfig);
        const experimentConfig = { ...currentConfig, ...overrides };

        // 벤치마크 실행
        const result = await runBenchmark(overrides, config.caseIds, signal, (caseId, ci, total) => {
          logger.info('AUTORESEARCH', `[${strategy.id}] ${ci + 1}/${total}: ${caseId}`);
        });

        if (signal.aborted) break;

        // ── 4. Keep / Discard 판정 ──
        const improvement = result.overallScore - bestScore;
        const status = improvement >= config.improvementThreshold ? 'keep' : 'discard';

        const entry: ExperimentEntry = {
          id: `exp-${Date.now()}`,
          timestamp: Date.now(),
          description: strategy.description,
          changes,
          metrics: result,
          status,
        };
        await appendResult(entry);

        if (status === 'keep') {
          bestScore = result.overallScore;
          currentConfig = experimentConfig;
          runningExperiment.bestScore = bestScore;

          // 설정 영구 저장
          const settingsUpdate = configToSettingsPartial(overrides);
          await saveSettings(settingsUpdate);

          logger.info('AUTORESEARCH', `[KEEP] ${strategy.name}: ${result.overallScore} (+${improvement.toFixed(1)})`);
        } else {
          logger.info('AUTORESEARCH', `[DISCARD] ${strategy.name}: ${result.overallScore} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)})`);
        }

        yield {
          type: 'experiment_end',
          data: {
            id: entry.id,
            experiment: i + 1,
            strategy: strategy.name,
            description: strategy.description,
            score: result.overallScore,
            improvement,
            status,
            categoryScores: result.categoryScores,
            avgResponseTime: result.avgResponseTime,
          },
        };
      } catch (err) {
        const crashEntry: ExperimentEntry = {
          id: `crash-${Date.now()}`,
          timestamp: Date.now(),
          description: strategy.description,
          changes: {},
          metrics: {
            overallScore: 0,
            categoryScores: {},
            avgResponseTime: 0,
            totalTokens: 0,
            caseResults: [],
          },
          status: 'crash',
        };
        await appendResult(crashEntry);

        yield {
          type: 'experiment_end',
          data: {
            experiment: i + 1,
            strategy: strategy.name,
            description: strategy.description,
            score: 0,
            status: 'crash',
            error: err instanceof Error ? err.message : 'Unknown error',
          },
        };
      }
    }

    // ── 5. 완료 ──
    const allResults = await loadResults();
    const keptCount = allResults.filter((r) => r.status === 'keep').length;

    yield {
      type: 'done',
      data: {
        baselineScore: baseline.overallScore,
        bestScore,
        totalExperiments: maxExp,
        keptCount,
        improvement: bestScore - baseline.overallScore,
        message: `실험 완료: ${maxExp}개 중 ${keptCount}개 적용, 점수 ${baseline.overallScore} → ${bestScore}`,
      },
    };
  } finally {
    runningExperiment = null;
  }
}

/**
 * AgentConfig 오버라이드 → Settings 부분 업데이트로 변환
 */
function configToSettingsPartial(overrides: Partial<AgentConfig>): Partial<Settings> {
  const partial: Partial<Settings> = {};

  if (overrides.systemPrompt !== undefined) partial.systemPrompt = overrides.systemPrompt;
  if (overrides.maxIterations !== undefined) partial.maxIterations = overrides.maxIterations;
  if (overrides.thinkingMode !== undefined) partial.thinkingMode = overrides.thinkingMode;
  if (overrides.thinkingForToolCalls !== undefined) partial.thinkingForToolCalls = overrides.thinkingForToolCalls;

  if (overrides.modelOptions) {
    partial.modelOptions = {
      temperature: overrides.modelOptions.temperature ?? 0.7,
      topP: overrides.modelOptions.top_p ?? 0.9,
      numPredict: overrides.modelOptions.num_predict ?? 2048,
    };
  }

  return partial;
}
