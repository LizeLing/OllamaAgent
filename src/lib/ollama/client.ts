import {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaChatStreamChunk,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaEmbedRequest,
  OllamaEmbedResponse,
  OllamaError,
} from './types';
import { CircuitBreaker } from '@/lib/infra/circuit-breaker';

const MAX_RETRIES = 2;

/** Ollama 전용 Circuit Breaker: 연속 5회 실패 시 30초간 차단 */
const ollamaBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  name: 'ollama',
});

/** Circuit Breaker를 외부에서 참조할 수 있도록 export */
export { ollamaBreaker };

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  return ollamaBreaker.execute(async () => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          throw new OllamaError(
            `Ollama API error: ${res.status} ${res.statusText}`,
            res.status
          );
        }
        return res;
      } catch (error) {
        if (i === retries) {
          if (error instanceof OllamaError) throw error;
          throw new OllamaError(
            `Ollama connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            undefined,
            error
          );
        }
        // 지수 백오프 + jitter (최대 30초)
        const delayMs = Math.min(1000 * Math.pow(2, i), 30000);
        await new Promise((r) => setTimeout(r, delayMs + Math.random() * 1000));
      }
    }
    throw new OllamaError('Unexpected error in fetchWithRetry');
  });
}

export async function chat(
  baseUrl: string,
  request: OllamaChatRequest
): Promise<OllamaChatResponse> {
  const payload = { ...request, stream: false };
  if (payload.tools && payload.tools.length > 0) {
    delete payload.format;
  }
  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function* chatStream(
  baseUrl: string,
  request: OllamaChatRequest
): AsyncGenerator<OllamaChatStreamChunk> {
  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...request,
      stream: true,
      ...(request.tools && request.tools.length > 0 ? { format: undefined } : {}),
    }),
  });

  const reader = res.body?.getReader();
  if (!reader) throw new OllamaError('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const MAX_BUFFER_SIZE = 64 * 1024; // 64KB 버퍼 제한

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > MAX_BUFFER_SIZE) {
      throw new OllamaError('스트리밍 버퍼 크기 초과 (64KB). 응답이 손상되었을 수 있습니다.');
    }
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch (err) {
          // 손상된 JSON 청크 무시 (스트리밍 경계에서 발생 가능)
          if (process.env.LOG_LEVEL === 'debug') {
            console.debug('[OLLAMA] Malformed JSON chunk:', line.slice(0, 100), err);
          }
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (err) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug('[OLLAMA] Malformed final buffer:', buffer.slice(0, 100), err);
      }
    }
  }
}

export async function generate(
  baseUrl: string,
  request: OllamaGenerateRequest
): Promise<OllamaGenerateResponse> {
  const res = await fetchWithRetry(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, stream: false }),
  });
  return res.json();
}

export async function embed(
  baseUrl: string,
  request: OllamaEmbedRequest
): Promise<OllamaEmbedResponse> {
  const res = await fetchWithRetry(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
