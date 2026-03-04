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

const MAX_RETRIES = 2;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
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
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new OllamaError('Unexpected error in fetchWithRetry');
}

export async function chat(
  baseUrl: string,
  request: OllamaChatRequest
): Promise<OllamaChatResponse> {
  const res = await fetchWithRetry(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, stream: false, think: false }),
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
    body: JSON.stringify({ ...request, stream: true, think: false }),
  });

  const reader = res.body?.getReader();
  if (!reader) throw new OllamaError('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {
      // skip
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
