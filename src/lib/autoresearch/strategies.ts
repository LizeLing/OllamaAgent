import { Strategy } from './types';
import { AgentConfig } from '@/lib/agent/types';

/**
 * 파라미터 스윕 전략 생성 헬퍼
 * 하나의 파라미터를 여러 값으로 변형하는 전략 배열 생성
 */
function createParamSweep<T>(
  baseName: string,
  paramPath: string,
  values: T[],
  getDescription: (v: T) => string,
  applyFn: (config: AgentConfig, value: T) => Partial<AgentConfig>,
  extractCurrent: (config: AgentConfig) => T
): Strategy[] {
  return values.map((value) => ({
    id: `${baseName}-${String(value)}`,
    name: `${paramPath} = ${String(value)}`,
    description: getDescription(value),
    apply(config: AgentConfig) {
      const before = extractCurrent(config);
      return {
        overrides: applyFn(config, value),
        changes: { [paramPath]: { before, after: value } },
      };
    },
  }));
}

// ─── Temperature 스윕 ───
const temperatureStrategies = createParamSweep(
  'temp',
  'temperature',
  [0.3, 0.5, 0.7, 0.9, 1.0],
  (v) => `temperature를 ${v}로 변경`,
  (_config, value) => ({
    modelOptions: { temperature: value },
  }),
  (config) => config.modelOptions?.temperature ?? 0.7
);

// ─── Top-p 스윕 ───
const topPStrategies = createParamSweep(
  'topp',
  'top_p',
  [0.7, 0.8, 0.9, 0.95],
  (v) => `top_p를 ${v}로 변경`,
  (_config, value) => ({
    modelOptions: { top_p: value },
  }),
  (config) => config.modelOptions?.top_p ?? 0.9
);

// ─── Thinking 모드 ───
const thinkingStrategies: Strategy[] = [
  {
    id: 'thinking-off',
    name: 'thinkingMode = off',
    description: 'Thinking 모드 비활성화 (속도 우선)',
    apply(config) {
      return {
        overrides: { thinkingMode: 'off' },
        changes: { thinkingMode: { before: config.thinkingMode, after: 'off' } },
      };
    },
  },
  {
    id: 'thinking-on',
    name: 'thinkingMode = on',
    description: 'Thinking 모드 항상 활성화 (품질 우선)',
    apply(config) {
      return {
        overrides: { thinkingMode: 'on', thinkingForToolCalls: true },
        changes: {
          thinkingMode: { before: config.thinkingMode, after: 'on' },
          thinkingForToolCalls: { before: config.thinkingForToolCalls, after: true },
        },
      };
    },
  },
];

// ─── Max Iterations 스윕 ───
const iterationStrategies = createParamSweep(
  'maxiter',
  'maxIterations',
  [5, 8, 15],
  (v) => `최대 반복 횟수를 ${v}로 변경`,
  (_config, value) => ({
    maxIterations: value,
  }),
  (config) => config.maxIterations
);

// ─── 시스템 프롬프트 변형 ───
const systemPromptStrategies: Strategy[] = [
  {
    id: 'prompt-concise',
    name: '간결한 시스템 프롬프트',
    description: '시스템 프롬프트를 최소화하여 응답 집중도 테스트',
    apply(config) {
      const newPrompt = '당신은 정확하고 간결한 AI 어시스턴트입니다. 한국어로 답변하세요.';
      return {
        overrides: { systemPrompt: newPrompt },
        changes: { systemPrompt: { before: config.systemPrompt.slice(0, 50) + '...', after: newPrompt } },
      };
    },
  },
  {
    id: 'prompt-detailed',
    name: '상세한 시스템 프롬프트',
    description: '구조화된 응답을 유도하는 상세 프롬프트',
    apply(config) {
      const newPrompt = `당신은 유능한 AI 어시스턴트입니다. 다음 원칙을 따르세요:
1. 한국어로 정확하고 도움이 되는 답변을 제공합니다.
2. 질문의 핵심을 파악하고 구조적으로 답변합니다.
3. 필요한 경우 도구를 적극적으로 활용합니다.
4. 불확실한 정보는 명시합니다.
5. 간결하되 필요한 내용은 빠뜨리지 않습니다.`;
      return {
        overrides: { systemPrompt: newPrompt },
        changes: { systemPrompt: { before: config.systemPrompt.slice(0, 50) + '...', after: newPrompt.slice(0, 80) + '...' } },
      };
    },
  },
  {
    id: 'prompt-tool-guidance',
    name: '도구 가이드 프롬프트',
    description: '도구 선택 정확도를 높이는 가이드 추가',
    apply(config) {
      const addition = `\n\n## 도구 사용 가이드
- 파일 읽기/쓰기: filesystem_read, filesystem_write
- 디렉토리 목록: filesystem_list
- 파일 검색: filesystem_search
- 웹 검색: web_search
- 코드 실행: code_execute
- HTTP 요청: http_request
적절한 도구가 있으면 반드시 사용하세요. 도구 없이 해결 가능하면 직접 답변하세요.`;
      return {
        overrides: { systemPrompt: config.systemPrompt + addition },
        changes: { systemPrompt: { before: '기존 프롬프트', after: '기존 + 도구 가이드 추가' } },
      };
    },
  },
];

/**
 * 모든 전략 목록 반환
 * 현재 설정과 동일한 값의 전략은 제외
 */
export function getStrategies(currentConfig?: AgentConfig): Strategy[] {
  const all = [
    ...temperatureStrategies,
    ...topPStrategies,
    ...thinkingStrategies,
    ...iterationStrategies,
    ...systemPromptStrategies,
  ];

  if (!currentConfig) return all;

  // 현재 설정과 동일한 전략 제외
  return all.filter((s) => {
    const { changes } = s.apply(currentConfig);
    return Object.values(changes).some((c) => c.before !== c.after);
  });
}

export function getStrategyById(id: string): Strategy | undefined {
  const all = [
    ...temperatureStrategies,
    ...topPStrategies,
    ...thinkingStrategies,
    ...iterationStrategies,
    ...systemPromptStrategies,
  ];
  return all.find((s) => s.id === id);
}
