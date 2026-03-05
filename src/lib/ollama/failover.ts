import {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaError,
} from './types';

export interface FailoverResult<T> {
  result: T;
  usedModel: string;
  failedModels: string[];
}

export type ChatFn = (
  baseUrl: string,
  request: OllamaChatRequest
) => Promise<OllamaChatResponse>;

const MODEL_ERROR_PATTERNS = [
  'not found',
  'model not found',
  'failed to load',
  'out of memory',
  'insufficient memory',
];

export function isModelError(error: unknown): boolean {
  if (error instanceof OllamaError && error.statusCode === 404) {
    return true;
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : '';

  return MODEL_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function chatWithFailover(
  chatFn: ChatFn,
  baseUrl: string,
  request: OllamaChatRequest,
  fallbackModels: string[]
): Promise<FailoverResult<OllamaChatResponse>> {
  const modelsToTry = [request.model, ...fallbackModels];
  const failedModels: string[] = [];

  for (const model of modelsToTry) {
    try {
      const result = await chatFn(baseUrl, { ...request, model });
      return { result, usedModel: model, failedModels };
    } catch (error) {
      if (!isModelError(error)) {
        throw error;
      }
      failedModels.push(model);

      // fallbackModels가 빈 배열이면 원본 에러 그대로 throw
      if (fallbackModels.length === 0) {
        throw error;
      }
    }
  }

  throw new OllamaError(
    `모든 모델이 실패했습니다: ${modelsToTry.join(', ')}`,
    404
  );
}
