import { AgentConfig } from '@/lib/agent/types';

// ─── 벤치마크 케이스 ───

export interface BenchmarkCase {
  id: string;
  category: 'tool_selection' | 'response_quality' | 'reasoning' | 'instruction_following';
  query: string;
  /** 기대하는 도구 호출 목록 (tool_selection 카테고리) */
  expectedTools?: string[];
  /** 응답에 포함되어야 할 키워드 */
  expectedKeywords?: string[];
  /** LLM 평가 기준 */
  evaluationCriteria: string;
  /** 점수 가중치 (기본 1.0) */
  weight: number;
  /** true면 도구 없이 직접 응답만 평가 */
  disableTools?: boolean;
}

// ─── 벤치마크 결과 ───

export interface CaseResult {
  caseId: string;
  category: string;
  score: number; // 0-100
  toolsCalled: string[];
  toolAccuracy: number; // 0-100
  keywordAccuracy: number; // 0-100
  responseTime: number; // ms
  tokenCount: number;
  response: string;
}

export interface BenchmarkResult {
  overallScore: number; // 0-100
  categoryScores: Record<string, number>;
  avgResponseTime: number;
  totalTokens: number;
  caseResults: CaseResult[];
}

// ─── 실험 ───

export interface ExperimentEntry {
  id: string;
  timestamp: number;
  description: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  metrics: BenchmarkResult;
  status: 'keep' | 'discard' | 'crash' | 'baseline';
}

export interface ExperimentProgress {
  type: 'status' | 'experiment_start' | 'experiment_end' | 'benchmark_progress' | 'done' | 'error';
  data: Record<string, unknown>;
}

export interface ExperimentConfig {
  /** 최대 실험 횟수 (기본 20) */
  maxExperiments: number;
  /** 개선 판정 최소 점수 차이 (기본 0.5) */
  improvementThreshold: number;
  /** 특정 케이스만 실행 */
  caseIds?: string[];
  /** 특정 전략만 실행 */
  strategyIds?: string[];
}

// ─── 전략 ───

export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** 현재 설정에서 변형된 AgentConfig 오버라이드 + 변경 내역 반환 */
  apply(currentConfig: AgentConfig): {
    overrides: Partial<AgentConfig>;
    changes: Record<string, { before: unknown; after: unknown }>;
  };
}
