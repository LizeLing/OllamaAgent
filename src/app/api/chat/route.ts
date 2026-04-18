import { NextRequest } from 'next/server';
import { formatSSE } from '@/lib/ollama/streaming';
import { loadSettings } from '@/lib/config/settings';
import { ChatRequest } from '@/types/api';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { getSkill } from '@/lib/skills/storage';
import { runSkill } from '@/lib/skills/skill-runner';
import { initializeTools, registerCustomTools, registerMcpTools, registerSubAgentTool } from '@/lib/tools/init';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';
import type { SearchResultWithSource } from '@/types/knowledge';
import { waitForApproval } from '@/lib/agent/approval';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';
import { HookExecutor } from '@/lib/hooks/executor';
import { logger, getErrorMessage } from '@/lib/logger';
import { PlanModeMiddleware } from '@/lib/agent/middleware/plan-mode';
import { buildResumeContext, type ResumeContext } from '@/lib/tasks/context-builder';
import { runBreakdown, type BreakdownInput } from '@/lib/tasks/breakdown-engine';
import { createTask, ensureTaskDirectories, readTask } from '@/lib/tasks/storage';
import { writeTaskMarkdown } from '@/lib/tasks/markdown';
import { createCheckpoint } from '@/lib/tasks/checkpoint';
import type { AgentConfig } from '@/lib/agent/types';

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

    // Task Mode command 경로: chat stream을 돌리지 않고 단일 이벤트 + done으로 응답
    if (body.taskMode === 'task' && typeof body.command === 'string') {
      return await handleTaskCommand(body);
    }

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
    const effectivePlanMode =
      body.planMode !== undefined ? !!body.planMode : !!settings.defaultPlanMode;
    const destructiveCustomToolNames = (settings.customTools ?? [])
      .filter((t) => t.destructive)
      .map((t) => `custom_${t.name}`);

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

    // Search knowledge base for context
    let knowledgeSources: SearchResultWithSource[] = [];
    try {
      const knowledgeManager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
      knowledgeSources = await knowledgeManager.search(body.message, 5);
    } catch {
      // Knowledge base unavailable, continue without
    }

    // Task Mode 연계: taskId가 있으면 resumeContext를 system prompt에 prepend
    let resumeContext: ResumeContext | null = null;
    if (body.taskMode === 'task' && typeof body.taskId === 'string' && body.taskId.length > 0) {
      try {
        resumeContext = await buildResumeContext(body.taskId, {});
      } catch (err) {
        logger.warn('CHAT', `Task resume context 로딩 실패: ${getErrorMessage(err)}`);
      }
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
          let composedSystemPrompt = settings.systemPrompt;
          if (resumeContext) {
            composedSystemPrompt = `${resumeContext.systemPrompt}\n\n---\n\n${composedSystemPrompt}`;
          }
          if (!effectivePlanMode && typeof body.approvedPlan === 'string' && body.approvedPlan.trim()) {
            composedSystemPrompt += `\n\n## 승인된 실행 계획\n사용자가 아래 계획을 승인했습니다. 이 계획에 따라 실제 작업을 수행하세요.\n\n${body.approvedPlan.trim()}`;
          }

          const agentConfig = {
              ollamaUrl: settings.ollamaUrl,
              ollamaModel: requestModel || settings.ollamaModel,
              maxIterations: settings.maxIterations,
              systemPrompt: composedSystemPrompt,
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
              planMode: effectivePlanMode,
              planBlockedTools: destructiveCustomToolNames,
              middlewares: effectivePlanMode
                ? [new PlanModeMiddleware(destructiveCustomToolNames)]
                : undefined,
          };

          // 지식 베이스 검색 결과를 시스템 프롬프트에 추가
          if (knowledgeSources.length > 0) {
            const knowledgeContext = knowledgeSources
              .map((s, i) => `${i + 1}. [${s.filename} > ${s.source}] ${s.text.slice(0, 300)}`)
              .join('\n');
            agentConfig.systemPrompt += `\n\n[참조 문서]\n${knowledgeContext}\n위 참조 문서를 인용할 때 [출처: 파일명] 형식으로 표기하세요.`;
          }

          const skill = body.skillId ? await getSkill(body.skillId) : null;
          const agentLoop = skill
            ? runSkill(agentConfig, skill, body.message, history, memories)
            : runAgentLoop(agentConfig, body.message, history, memories, body.images || [], abortController.signal);

          // 지식 베이스 출처 정보를 클라이언트에 전달
          if (knowledgeSources.length > 0) {
            controller.enqueue(
              encoder.encode(formatSSE('knowledge_search', { sources: knowledgeSources }))
            );
          }

          // Task resume context metadata를 클라이언트에 전달
          if (resumeContext) {
            controller.enqueue(
              encoder.encode(
                formatSSE('task_context_loaded', {
                  taskId: resumeContext.taskId,
                  checkpointId: resumeContext.checkpointId,
                  metadata: resumeContext.metadata,
                }),
              ),
            );
          }

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

/**
 * Task Mode 제어 명령을 단일 SSE 이벤트 + done 으로 응답한다.
 * - new: runBreakdown → saveTask → 초기 markdown 기록
 * - open: buildResumeContext
 * - checkpoint: createCheckpoint (현재 taskId 기준)
 * - execute: /api/tasks/[id]/execute 위임 플레이스홀더 (stream-dev 영역에 위임)
 */
async function handleTaskCommand(body: ChatRequest): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      try {
        switch (body.command) {
          case 'new': {
            const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
            if (!goal) {
              emit('error', { message: "command='new'는 'goal' 필드가 필요합니다." });
              break;
            }
            const settings = await loadSettings();
            const agentConfig: AgentConfig = {
              ollamaUrl: settings.ollamaUrl,
              ollamaModel: typeof body.model === 'string' && body.model ? body.model : settings.ollamaModel,
              maxIterations: settings.maxIterations,
              systemPrompt: '',
              allowedPaths: settings.allowedPaths,
              deniedPaths: settings.deniedPaths,
              modelOptions: settings.modelOptions
                ? {
                    temperature: settings.modelOptions.temperature,
                    top_p: settings.modelOptions.topP,
                    num_predict: settings.modelOptions.numPredict,
                  }
                : undefined,
              fallbackModels: settings.fallbackModels || [],
            };
            const input: BreakdownInput = { goal };
            const record = await runBreakdown(input, agentConfig);
            await ensureTaskDirectories(record.id);
            await createTask(record);
            await writeTaskMarkdown(record.id, record);
            emit('task_created', { task: record });
            break;
          }
          case 'open': {
            const taskId = typeof body.taskId === 'string' ? body.taskId : '';
            if (!taskId) {
              emit('error', { message: "command='open'은 'taskId' 필드가 필요합니다." });
              break;
            }
            const task = await readTask(taskId);
            if (!task) {
              emit('error', { message: `Task를 찾을 수 없습니다: ${taskId}` });
              break;
            }
            const context = await buildResumeContext(taskId, {});
            emit('task_context_loaded', {
              taskId: context.taskId,
              checkpointId: context.checkpointId,
              systemPrompt: context.systemPrompt,
              userMessage: context.userMessage,
              metadata: context.metadata,
            });
            break;
          }
          case 'checkpoint': {
            const taskId = typeof body.taskId === 'string' ? body.taskId : '';
            if (!taskId) {
              emit('error', { message: "command='checkpoint'는 'taskId' 필드가 필요합니다." });
              break;
            }
            const task = await readTask(taskId);
            if (!task) {
              emit('error', { message: `Task를 찾을 수 없습니다: ${taskId}` });
              break;
            }
            const checkpoint = await createCheckpoint(taskId);
            emit('task_checkpoint_created', { checkpoint });
            break;
          }
          case 'execute': {
            const taskId = typeof body.taskId === 'string' ? body.taskId : '';
            if (!taskId) {
              emit('error', { message: "command='execute'는 'taskId' 필드가 필요합니다." });
              break;
            }
            emit('task_execute_deferred', {
              taskId,
              message: '실행은 /api/tasks/[id]/execute 로 위임되어야 합니다.',
            });
            break;
          }
          default:
            emit('error', { message: `알 수 없는 command: ${body.command}` });
        }
        emit('done', {});
      } catch (err) {
        emit('error', { message: getErrorMessage(err) });
        emit('done', {});
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
}
