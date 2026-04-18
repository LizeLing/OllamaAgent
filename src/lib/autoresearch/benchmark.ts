import { runAgentLoop } from '@/lib/agent/agent-loop';
import { AgentConfig, AgentEvent } from '@/lib/agent/types';
import { initializeTools } from '@/lib/tools/init';
import { loadSettings } from '@/lib/config/settings';
import { BenchmarkCase, BenchmarkResult, CaseResult } from './types';
import { scoreCase } from './evaluator';
import { DEFAULT_BENCHMARK_CASES } from './default-cases';
import { ToolMiddleware } from '@/lib/agent/middleware/types';

/** 도구 실행을 건너뛰는 벤치마크 전용 미들웨어 */
const benchmarkSkipToolMiddleware: ToolMiddleware = {
  name: 'benchmark-skip-execution',
  async beforeExecute(toolName: string, args: Record<string, unknown>) {
    return {
      toolName,
      args,
      skip: true,
      skipReason: `[벤치마크] ${toolName} 도구가 선택되었습니다. (실행 생략)`,
    };
  },
};

/**
 * 단일 벤치마크 케이스 실행
 * 에이전트 루프를 돌리고 이벤트를 수집하여 점수를 계산
 */
async function runCase(
  benchmarkCase: BenchmarkCase,
  config: AgentConfig,
  signal?: AbortSignal
): Promise<CaseResult> {
  const startTime = Date.now();
  const toolsCalled: string[] = [];
  let response = '';
  let tokenCount = 0;

  // 벤치마크용 설정 오버라이드
  const benchConfig: AgentConfig = {
    ...config,
    maxIterations: benchmarkCase.disableTools ? 1 : 3,
    toolApprovalMode: 'auto',
    // 도구 비활성화 시 존재하지 않는 도구명으로 필터링
    enabledTools: benchmarkCase.disableTools ? ['__benchmark_disabled__'] : config.enabledTools,
    // 도구 실행 건너뛰기 미들웨어 추가
    toolMiddlewares: benchmarkCase.disableTools
      ? config.toolMiddlewares
      : [...(config.toolMiddlewares || []), benchmarkSkipToolMiddleware],
    // 벤치마크에서는 thinking 비활성화 (속도 우선)
    thinkingMode: 'off',
  };

  try {
    const events: AsyncGenerator<AgentEvent> = runAgentLoop(
      benchConfig,
      benchmarkCase.query,
      [],  // 히스토리 없음
      [],  // 메모리 없음
      [],  // 이미지 없음
      signal
    );

    for await (const event of events) {
      switch (event.type) {
        case 'tool_start':
          toolsCalled.push(event.data.tool as string);
          break;
        case 'token':
          response += event.data.content as string;
          tokenCount++;
          break;
        case 'error':
          response = `[에러] ${event.data.message || 'Unknown error'}`;
          break;
      }
    }
  } catch (err) {
    response = `[실행 실패] ${err instanceof Error ? err.message : 'Unknown'}`;
  }

  const responseTime = Date.now() - startTime;

  return scoreCase(
    benchmarkCase,
    response,
    toolsCalled,
    responseTime,
    tokenCount,
    config.ollamaUrl,
    config.ollamaModel
  );
}

/**
 * 전체 벤치마크 실행
 * 모든 케이스를 순차 실행하고 종합 점수 계산
 */
export async function runBenchmark(
  configOverrides?: Partial<AgentConfig>,
  caseIds?: string[],
  signal?: AbortSignal,
  onProgress?: (caseId: string, index: number, total: number) => void
): Promise<BenchmarkResult> {
  // 설정 로드 및 도구 초기화
  const settings = await loadSettings();
  await initializeTools(
    settings.allowedPaths,
    settings.deniedPaths,
    settings.searxngUrl,
    settings.ollamaUrl,
    settings.imageModel,
    settings.webSearchProvider,
    settings.ollamaApiKey
  );

  // 기본 AgentConfig 구성
  const baseConfig: AgentConfig = {
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
    ...configOverrides,
  };

  // 실행할 케이스 필터링
  let cases = DEFAULT_BENCHMARK_CASES;
  if (caseIds && caseIds.length > 0) {
    cases = cases.filter((c) => caseIds.includes(c.id));
  }

  // 순차 실행 (Ollama 동시 호출 방지)
  const caseResults: CaseResult[] = [];
  for (let i = 0; i < cases.length; i++) {
    if (signal?.aborted) break;
    onProgress?.(cases[i].id, i, cases.length);
    const result = await runCase(cases[i], baseConfig, signal);
    caseResults.push(result);
  }

  // 카테고리별 점수 집계
  const categoryScores: Record<string, number> = {};
  const categoryGroups: Record<string, CaseResult[]> = {};
  for (const r of caseResults) {
    if (!categoryGroups[r.category]) categoryGroups[r.category] = [];
    categoryGroups[r.category].push(r);
  }
  for (const [cat, results] of Object.entries(categoryGroups)) {
    const caseWeights = cases.filter((c) => c.category === cat);
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < results.length; i++) {
      const w = caseWeights[i]?.weight || 1;
      weightedSum += results[i].score * w;
      totalWeight += w;
    }
    categoryScores[cat] = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
  }

  // 종합 점수 (가중 평균)
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (let i = 0; i < caseResults.length; i++) {
    const w = cases[i]?.weight || 1;
    totalWeightedScore += caseResults[i].score * w;
    totalWeight += w;
  }
  const overallScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 10) / 10 : 0;

  return {
    overallScore,
    categoryScores,
    avgResponseTime: Math.round(caseResults.reduce((s, r) => s + r.responseTime, 0) / caseResults.length),
    totalTokens: caseResults.reduce((s, r) => s + r.tokenCount, 0),
    caseResults,
  };
}
