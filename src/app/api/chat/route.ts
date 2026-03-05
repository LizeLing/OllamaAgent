import { NextRequest } from 'next/server';
import { formatSSE } from '@/lib/ollama/streaming';
import { loadSettings } from '@/lib/config/settings';
import { ChatRequest } from '@/types/api';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { initializeTools, registerCustomTools, registerMcpTools } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { waitForApproval } from '@/lib/agent/approval';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

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
    const { model: requestModel } = body;
    const settings = await loadSettings();

    initializeTools(
      settings.allowedPaths,
      settings.deniedPaths,
      settings.searxngUrl,
      settings.ollamaUrl,
      settings.imageModel
    );

    // Register custom tools and MCP tools
    if (settings.customTools?.length) {
      registerCustomTools(settings.customTools);
    }
    if (settings.mcpServers?.length) {
      await registerMcpTools(settings.mcpServers);
    }

    const history = body.history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Search memories for context
    let memories: string[] = [];
    try {
      const memoryManager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
      memories = await memoryManager.searchMemories(body.message, 3);
    } catch {
      // RAG unavailable, continue without memories
    }

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        try {
          const agentLoop = runAgentLoop(
            {
              ollamaUrl: settings.ollamaUrl,
              ollamaModel: requestModel || settings.ollamaModel,
              maxIterations: settings.maxIterations,
              systemPrompt: settings.systemPrompt,
              allowedPaths: settings.allowedPaths,
              deniedPaths: settings.deniedPaths,
              toolApprovalMode: settings.toolApprovalMode,
              modelOptions: settings.modelOptions ? {
                temperature: settings.modelOptions.temperature,
                top_p: settings.modelOptions.topP,
                num_predict: settings.modelOptions.numPredict,
              } : undefined,
              enabledTools: settings.enabledTools?.length ? settings.enabledTools : undefined,
              onToolApproval: settings.toolApprovalMode !== 'auto'
                ? (_toolName: string, _args: Record<string, unknown>, confirmId: string) => {
                    return waitForApproval(confirmId);
                  }
                : undefined,
            },
            body.message,
            history,
            memories,
            body.images || [],
          );

          for await (const event of agentLoop) {
            if (event.type === 'token') {
              fullResponse += event.data.content as string;
            }
            controller.enqueue(
              encoder.encode(formatSSE(event.type, event.data))
            );
          }

          // Save conversation to memory (async, don't block)
          if (fullResponse.length > 20) {
            const memoryManager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
            memoryManager.saveConversationSummary(body.message, fullResponse).catch(() => {});
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
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
    console.error('[CHAT_ERROR]', error instanceof Error ? error.message : error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
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
