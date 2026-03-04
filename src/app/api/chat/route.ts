import { NextRequest } from 'next/server';
import { formatSSE } from '@/lib/ollama/streaming';
import { loadSettings } from '@/lib/config/settings';
import { ChatRequest } from '@/types/api';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { initializeTools } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { waitForApproval } from '@/lib/agent/approval';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body: ChatRequest = await request.json();
    const settings = await loadSettings();

    initializeTools(
      settings.allowedPaths,
      settings.deniedPaths,
      settings.searxngUrl,
      settings.ollamaUrl,
      settings.imageModel
    );

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
              ollamaModel: settings.ollamaModel,
              maxIterations: settings.maxIterations,
              systemPrompt: settings.systemPrompt,
              allowedPaths: settings.allowedPaths,
              deniedPaths: settings.deniedPaths,
              toolApprovalMode: settings.toolApprovalMode,
              onToolApproval: settings.toolApprovalMode !== 'auto'
                ? (toolName: string) => {
                    const confirmId = `${Date.now()}-${toolName}`;
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
