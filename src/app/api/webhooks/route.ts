import { NextRequest } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { initializeTools, registerCustomTools, registerMcpTools } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { hashKey } from '@/lib/webhooks/auth';
import { findKeyByHash, updateLastUsed } from '@/lib/webhooks/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.webhook)) {
    return Response.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
  }

  // API 키 인증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'Authorization header required' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const keyHash = hashKey(apiKey);
  const storedKey = await findKeyByHash(keyHash);

  if (!storedKey) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // 마지막 사용 시간 업데이트 (비동기)
  updateLastUsed(keyHash).catch(() => {});

  // 요청 파싱 및 검증
  let body: { message?: unknown; model?: unknown; systemPrompt?: unknown; callbackUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 10000) {
    return Response.json({ error: 'message is required (max 10000 chars)' }, { status: 400 });
  }

  const callbackUrl = body.callbackUrl;
  if (callbackUrl !== undefined) {
    if (typeof callbackUrl !== 'string') {
      return Response.json({ error: 'callbackUrl must be a string' }, { status: 400 });
    }
    try {
      const parsed = new URL(callbackUrl);
      if (parsed.protocol !== 'https:') {
        return Response.json({ error: 'callbackUrl must use HTTPS' }, { status: 400 });
      }
    } catch {
      return Response.json({ error: 'callbackUrl is not a valid URL' }, { status: 400 });
    }
  }

  const settings = await loadSettings();
  const model = (typeof body.model === 'string' ? body.model : undefined) || settings.ollamaModel;
  const systemPrompt = (typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined) || settings.systemPrompt;

  // 도구 초기화
  initializeTools(
    settings.allowedPaths, settings.deniedPaths,
    settings.searxngUrl, settings.ollamaUrl, settings.imageModel
  );
  if (settings.customTools?.length) registerCustomTools(settings.customTools);
  if (settings.mcpServers?.length) await registerMcpTools(settings.mcpServers);

  // 메모리 검색
  let memories: string[] = [];
  try {
    const mm = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
    memories = await mm.searchMemories(message, 3);
  } catch { /* continue without */ }

  // 에이전트 실행
  try {
    const agentLoop = runAgentLoop(
      {
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: model,
        maxIterations: settings.maxIterations,
        systemPrompt,
        allowedPaths: settings.allowedPaths,
        deniedPaths: settings.deniedPaths,
        toolApprovalMode: 'auto',
        modelOptions: settings.modelOptions ? {
          temperature: settings.modelOptions.temperature,
          top_p: settings.modelOptions.topP,
          num_predict: settings.modelOptions.numPredict,
        } : undefined,
        fallbackModels: settings.fallbackModels || [],
      },
      message, [], memories
    );

    let fullResponse = '';
    const toolCalls: { tool: string; input: unknown; output: string }[] = [];
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let usedModel = model;

    for await (const event of agentLoop) {
      if (event.type === 'token') fullResponse += event.data.content as string;
      if (event.type === 'tool_end') {
        toolCalls.push({
          tool: event.data.tool as string,
          input: event.data.input ?? {},
          output: event.data.output as string,
        });
      }
      if (event.type === 'done') {
        if (event.data.tokenUsage) {
          tokenUsage = event.data.tokenUsage as typeof tokenUsage;
        }
        usedModel = (event.data.model as string) || model;
      }
    }

    const result = {
      success: true,
      response: fullResponse,
      model: usedModel,
      toolCalls,
      tokenUsage,
    };

    // 비동기 콜백
    if (typeof callbackUrl === 'string') {
      fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }

    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
