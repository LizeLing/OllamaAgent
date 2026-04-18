import { generate } from '@/lib/ollama/client';
import { BenchmarkCase, CaseResult } from './types';

/**
 * 도구 선택 정확도 (Jaccard similarity)
 * expectedTools와 actualTools의 교집합/합집합 비율
 */
export function scoreToolAccuracy(expectedTools: string[], actualTools: string[]): number {
  if (expectedTools.length === 0) {
    return actualTools.length === 0 ? 100 : 70; // 도구 없어야 하는데 호출한 경우 감점
  }
  if (actualTools.length === 0) return 0;

  const expected = new Set(expectedTools);
  const actual = new Set(actualTools);
  const intersection = [...expected].filter((t) => actual.has(t)).length;
  const union = new Set([...expected, ...actual]).size;

  return Math.round((intersection / union) * 100);
}

/**
 * 키워드 포함 정확도
 * 응답에 expectedKeywords가 몇 개 포함되어 있는지
 */
export function scoreKeywords(expectedKeywords: string[], response: string): number {
  if (!expectedKeywords || expectedKeywords.length === 0) return 100;
  const lower = response.toLowerCase();
  const found = expectedKeywords.filter((k) => lower.includes(k.toLowerCase()));
  return Math.round((found.length / expectedKeywords.length) * 100);
}

/**
 * LLM 기반 응답 품질 평가 (0-100)
 * Ollama generate로 평가 요청 → 숫자 점수 추출
 */
export async function scoreLLMJudge(
  ollamaUrl: string,
  model: string,
  query: string,
  response: string,
  criteria: string
): Promise<number> {
  const prompt = `당신은 AI 응답 품질 평가자입니다. 아래 기준에 따라 점수를 매겨주세요.

## 질문
${query}

## AI 응답
${response.slice(0, 2000)}

## 평가 기준
${criteria}

## 채점 기준
- 0-2: 완전히 틀리거나 무관한 응답
- 3-4: 부분적으로 맞지만 부족
- 5-6: 기본적으로 맞지만 개선 여지 있음
- 7-8: 좋은 응답
- 9-10: 우수한 응답

점수를 0~10 사이 정수로만 답해주세요. 숫자만 출력:`;

  try {
    const result = await generate(ollamaUrl, {
      model,
      prompt,
      options: { temperature: 0.1, num_predict: 8 },
    });
    const match = result.response.match(/(\d+)/);
    if (match) {
      const score = Math.min(parseInt(match[1], 10), 10);
      return score * 10; // 0-10 → 0-100
    }
    return 50; // 파싱 실패 시 중간값
  } catch {
    return 50;
  }
}

/**
 * 단일 케이스 종합 점수 계산
 */
export async function scoreCase(
  benchmarkCase: BenchmarkCase,
  response: string,
  toolsCalled: string[],
  responseTime: number,
  tokenCount: number,
  ollamaUrl: string,
  model: string
): Promise<CaseResult> {
  const toolAccuracy = benchmarkCase.expectedTools
    ? scoreToolAccuracy(benchmarkCase.expectedTools, toolsCalled)
    : 100;

  const keywordAccuracy = scoreKeywords(benchmarkCase.expectedKeywords || [], response);

  // 카테고리별 점수 계산
  let score: number;
  switch (benchmarkCase.category) {
    case 'tool_selection':
      // 도구 선택이 핵심: 도구 70% + 키워드 30%
      score = toolAccuracy * 0.7 + keywordAccuracy * 0.3;
      break;
    case 'response_quality':
      // LLM 평가 사용: LLM 60% + 키워드 40%
      {
        const llmScore = await scoreLLMJudge(
          ollamaUrl,
          model,
          benchmarkCase.query,
          response,
          benchmarkCase.evaluationCriteria
        );
        score = llmScore * 0.6 + keywordAccuracy * 0.4;
      }
      break;
    case 'reasoning':
      // 정답 키워드가 핵심: 키워드 80% + 응답 존재 20%
      score = keywordAccuracy * 0.8 + (response.length > 10 ? 20 : 0);
      break;
    case 'instruction_following':
      // 형식 준수: 키워드 70% + LLM 30%
      {
        const llmScore = await scoreLLMJudge(
          ollamaUrl,
          model,
          benchmarkCase.query,
          response,
          benchmarkCase.evaluationCriteria
        );
        score = keywordAccuracy * 0.7 + llmScore * 0.3;
      }
      break;
    default:
      score = keywordAccuracy;
  }

  return {
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    score: Math.round(score * 10) / 10,
    toolsCalled,
    toolAccuracy,
    keywordAccuracy,
    responseTime,
    tokenCount,
    response: response.slice(0, 500), // 로그용으로 자름
  };
}
