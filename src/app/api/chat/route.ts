import { NextRequest } from 'next/server';
import { formatSSE } from '@/lib/ollama/streaming';
import { loadSettings } from '@/lib/config/settings';
import { ChatRequest } from '@/types/api';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { getSkill } from '@/lib/skills/storage';
import { runSkill } from '@/lib/skills/skill-runner';
import { initializeTools, registerCustomTools, registerMcpTools, registerSubAgentTool } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { waitForApproval } from '@/lib/agent/approval';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';
import { HookExecutor } from '@/lib/hooks/executor';
import { logger, getErrorMessage } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`chat:${clientIP}`, RATE_LIMITS.chat)) {
      return new Response(
        JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

  try {
    const body: ChatRequest = await request.json();
    if (!body.message || typeof body.message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!Array.isArray(body.history)) {
      body.history = [];
    }
    const { model: requestModel, format: requestFormat } = body;
    const settings = await loadSettings();

    initializeTools(
      settings.allowedPaths,
      settings.deniedPaths,
      settings.searxngUrl,
      settings.ollamaUrl,
      settings.imageModel,
      settings.webSearchProvider || 'searxng',
      settings.ollamaApiKey || ''
    );

    // Register custom tools and MCP tools
    if (settings.customTools?.length) {
      registerCustomTools(settings.customTools);
    }
    if (settings.mcpServers?.length) {
      await registerMcpTools(settings.mcpServers);
    }

    // Register subagent tool
    registerSubAgentTool({
      ollamaUrl: settings.ollamaUrl,
      ollamaModel: requestModel || settings.ollamaModel,
      maxIterations: settings.maxIterations,
      systemPrompt: settings.systemPrompt,
      allowedPaths: settings.allowedPaths,
      deniedPaths: settings.deniedPaths,
      fallbackModels: settings.fallbackModels || [],
      nestingDepth: 0,
      maxNestingDepth: 2,
    });

    const history = body.history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Search memories for context (인스턴스를 한 번만 생성하여 재사용)
    let memoryManager: MemoryManager | null = null;
    let memories: string[] = [];
    try {
      memoryManager = new MemoryManager(
        settings.ollamaUrl,
        settings.embeddingModel,
        settings.memoryCategories
      );
      memories = await memoryManager.searchMemories(body.message, 3);
    } catch {
      // RAG unavailable, continue without memories
    }

    HookExecutor.fireAndForget('on_message_received', { message: body.message, model: requestModel });

    // AbortController for client disconnect detection
    const abortController = new AbortController();
    try {
      request.signal.addEventListener('abort', () => abortController.abort());
    } catch {
      // 테스트 환경 등에서 signal이 없을 수 있음
    }

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        try {
          const agentConfig = {
              ollamaUrl: settings.ollamaUrl,
              ollamaModel: requestModel || settings.ollamaModel,
              maxIterations: settings.maxIterations,
              systemPrompt: settings.systemPrompt,
              allowedPaths: settings.allowedPaths,
              deniedPaths: settings.deniedPaths,
              toolApprovalMode: settings.toolApprovalMode as 'auto' | 'confirm' | 'deny-dangerous' | undefined,
              modelOptions: settings.modelOptions ? {
                temperature: settings.modelOptions.temperature,
                top_p: settings.modelOptions.topP,
                num_predict: settings.modelOptions.numPredict,
              } : undefined,
              enabledTools: settings.enabledTools?.length ? settings.enabledTools : undefined,
              fallbackModels: settings.fallbackModels || [],
              format: requestFormat,
              thinkingMode: settings.thinkingMode || 'auto',
              thinkingForToolCalls: settings.thinkingForToolCalls ?? false,
              onToolApproval: settings.toolApprovalMode !== 'auto'
                ? (_toolName: string, _args: Record<string, unknown>, confirmId: string) => {
                    return waitForApproval(confirmId);
                  }
                : undefined,
          };

          const skill = body.skillId ? await getSkill(body.skillId) : null;
          const agentLoop = skill
            ? runSkill(agentConfig, skill, body.message, history, memories)
            : runAgentLoop(agentConfig, body.message, history, memories, body.images || [], abortController.signal);

          for await (const event of agentLoop) {
            if (abortController.signal.aborted) break;

            if (event.type === 'token') {
              fullResponse += event.data.content as string;
            }
            if (event.type === 'tool_start') {
              HookExecutor.fireAndForget('on_tool_start', event.data);
            } else if (event.type === 'tool_end') {
              HookExecutor.fireAndForget('on_tool_end', event.data);
            } else if (event.type === 'error') {
              HookExecutor.fireAndForget('on_error', event.data);
            } else if (event.type === 'done') {
              HookExecutor.fireAndForget('on_response_complete', { ...event.data, response: fullResponse });
            }
            controller.enqueue(
              encoder.encode(formatSSE(event.type, event.data))
            );
          }

          // Save conversation to memory (async, don't block)
          if (fullResponse.length > 20 && memoryManager) {
            memoryManager.saveConversationSummary(body.message, fullResponse).catch(() => {});
          }
        } catch (error) {
          const msg = getErrorMessage(error);
          controller.enqueue(
            encoder.encode(formatSSE('error', { message: msg }))
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('CHAT', 'Request handling failed', error);
    const msg = getErrorMessage(error);
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(formatSSE('error', { message: msg })));
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
