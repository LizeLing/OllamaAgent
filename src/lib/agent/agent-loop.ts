import { AgentConfig, AgentEvent } from './types';
import { toolRegistry } from '@/lib/tools/registry';
import { chat as rawChat, chatStream } from '@/lib/ollama/client';
import { chatWithFailover } from '@/lib/ollama/failover';
import { OllamaChatMessage } from '@/lib/ollama/types';
import { ToolCallTracker } from './tool-call-tracker';
import { MiddlewareChain } from './middleware/chain';
import { ToolMiddlewareChain } from './middleware/tool-chain';
import { MiddlewareContext } from './middleware/types';
import { PLAN_MODE_BLOCKED_TOOLS } from '@/types/chat';

function resolveEnabledTools(config: AgentConfig): string[] | undefined {
  if (!config.planMode) return config.enabledTools;

  const blocked = new Set<string>([
    ...PLAN_MODE_BLOCKED_TOOLS,
    ...(config.planBlockedTools ?? []),
  ]);

  const allNames = toolRegistry.getToolNames();
  const candidate = config.enabledTools?.length ? config.enabledTools : allNames;
  return candidate.filter((name) => !blocked.has(name));
}

function resolveThink(
  config: AgentConfig,
  phase: 'tool_selection' | 'final_response'
): boolean {
  const mode = config.thinkingMode || 'auto';
  if (mode === 'off') return false;
  if (mode === 'on') {
    if (phase === 'tool_selection') return config.thinkingForToolCalls ?? false;
    return true;
  }
  // auto: 기존 동작 유지
  return phase === 'final_response';
}

export async function* runAgentLoop(
  config: AgentConfig,
  userMessage: string,
  history: { role: string; content: string }[],
  memories: string[] = [],
  images: string[] = [],
  abortSignal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  // 미들웨어 체인 초기화 (optional)
  const chain = config.middlewares?.length
    ? new MiddlewareChain(config.middlewares)
    : null;
  const toolChain = config.toolMiddlewares?.length
    ? new ToolMiddlewareChain(config.toolMiddlewares)
    : null;

  // Build system prompt with memories
  let systemPrompt = config.systemPrompt;
  if (memories.length > 0) {
    systemPrompt += '\n\n## 관련 기억\n' + memories.map((m) => `- ${m}`).join('\n');
  }

  const userMsg: OllamaChatMessage = { role: 'user', content: userMessage };
  if (images.length > 0) {
    userMsg.images = images;
  }

  // Trim history to fit context window
  // 한국어는 글자당 ~2-3 토큰, 영어는 ~0.25 토큰 소비
  // 보수적으로 10K chars로 제한 (혼합 텍스트 기준 ~20K 토큰)
  const maxHistoryChars = 10000;
  const trimmedHistory = trimHistory(history, maxHistoryChars);

  let messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];

  // 미들웨어: beforeAgent
  if (chain) {
    let mwCtx = buildMiddlewareContext(config, messages, userMessage, history, memories);
    mwCtx = await chain.runBeforeAgent(mwCtx);
    messages = mwCtx.messages;
  }

  const tools = toolRegistry.toOllamaTools(resolveEnabledTools(config));
  const tracker = new ToolCallTracker();
  let activeModel = config.ollamaModel;
  let fullResponse = '';
  const blockedToolAttempts: string[] = [];

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    if (abortSignal?.aborted) {
      yield { type: 'done', data: { iterations: iteration, model: activeModel, aborted: true } };
      return;
    }

    // 미들웨어: beforeModel (매 iteration)
    if (chain) {
      let mwCtx = buildMiddlewareContext(config, messages, userMessage, history, memories);
      mwCtx = await chain.runBeforeModel(mwCtx);
      messages = mwCtx.messages;
    }

    yield { type: 'thinking', data: { iteration } };

    // Non-streaming call to check for tool use (think: false for speed)
    const { result: response, usedModel, failedModels } = await chatWithFailover(
      rawChat, config.ollamaUrl,
      { model: activeModel, messages, stream: false, think: resolveThink(config, 'tool_selection'), tools, options: config.modelOptions },
      config.fallbackModels || []
    );

    if (failedModels.length > 0) {
      yield { type: 'model_fallback', data: { originalModel: activeModel, usedModel, reason: `모델 ${failedModels.join(', ')} 사용 불가` } };
      activeModel = usedModel;
    }

    const assistantMsg = response.message;
    let toolCalls = assistantMsg.tool_calls;

    // Plan 모드 방어: 차단 도구가 leak되면 제거하고 기록
    if (config.planMode && toolCalls && toolCalls.length > 0) {
      const blocked = new Set<string>([
        ...PLAN_MODE_BLOCKED_TOOLS,
        ...(config.planBlockedTools ?? []),
      ]);
      const leaked = toolCalls.filter((tc) => blocked.has(tc.function.name));
      if (leaked.length > 0) {
        for (const tc of leaked) {
          blockedToolAttempts.push(tc.function.name);
          yield { type: 'plan_blocked', data: { tool: tc.function.name, input: tc.function.arguments } };
        }
        toolCalls = toolCalls.filter((tc) => !blocked.has(tc.function.name));
      }
    }

    // 미들웨어: afterModel (toolCalls 필터링/수정)
    if (chain && toolCalls && toolCalls.length > 0) {
      const mwCtx = buildMiddlewareContext(config, messages, userMessage, history, memories);
      const toolCallInfos = toolCalls.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
      const filtered = await chain.runAfterModel(mwCtx, toolCallInfos);
      // 필터링된 결과를 원래 toolCalls 형식으로 변환
      toolCalls = filtered.map((info) => ({
        function: { name: info.name, arguments: info.arguments },
      }));
    }

    if (!toolCalls || toolCalls.length === 0) {
      // No tool call -> final answer. Use chatStream with think: true for thinking tokens.
      const thinkingStartTime = Date.now();
      let hasThinking = false;
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of chatStream(config.ollamaUrl, {
        model: activeModel,
        messages,
        think: resolveThink(config, 'final_response'),
        options: config.modelOptions,
        format: config.format,
      })) {
        if (abortSignal?.aborted) {
          yield { type: 'done', data: { iterations: iteration + 1, model: activeModel, aborted: true } };
          return;
        }
        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count || 0;
          completionTokens = chunk.eval_count || 0;
        }
        if (chunk.message?.thinking) {
          hasThinking = true;
          yield { type: 'thinking_token', data: { content: chunk.message.thinking } };
        }
        if (chunk.message?.content) {
          fullResponse += chunk.message.content;
          yield { type: 'token', data: { content: chunk.message.content } };
        }
      }

      if (hasThinking) {
        const thinkingDuration = Date.now() - thinkingStartTime;
        yield { type: 'thinking_token', data: { done: true, duration: thinkingDuration } };
      }

      // 미들웨어: afterAgent (fire-and-forget)
      if (chain) {
        const mwCtx = buildMiddlewareContext(config, messages, userMessage, history, memories);
        chain.runAfterAgent(mwCtx, fullResponse).catch(() => {});
      }

      if (config.planMode) {
        yield {
          type: 'plan',
          data: {
            plan: fullResponse,
            blockedTools: blockedToolAttempts,
            model: activeModel,
          },
        };
      }

      yield { type: 'done', data: {
        iterations: iteration + 1,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model: activeModel,
        planMode: config.planMode ?? false,
      }};
      return;
    }

    // Yield any text content before tool calls
    if (assistantMsg.content) {
      const chunks = splitIntoChunks(assistantMsg.content);
      for (const chunk of chunks) {
        yield { type: 'token', data: { content: chunk } };
      }
    }

    // Add assistant message with tool_calls to conversation
    messages.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: toolCalls,
    });

    // Execute each tool call
    const DANGEROUS_TOOLS = ['code_execute', 'filesystem_write'];
    let loopAborted = false;

    // 승인 필요 여부 사전 체크 + 루프 감지
    const needsApproval = config.toolApprovalMode && config.toolApprovalMode !== 'auto';
    const pendingTools: typeof toolCalls = [];

    for (const tc of toolCalls) {
      if (abortSignal?.aborted) { loopAborted = true; break; }

      const toolName = tc.function.name;
      const toolArgs = tc.function.arguments;
      const checkResult = tracker.check(toolName, toolArgs);

      if (checkResult.action === 'abort') {
        yield { type: 'loop_detected', data: { toolName, count: 3, message: '동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다.' } };
        messages.push({ role: 'tool', content: `[시스템] 도구 반복 호출로 인해 에이전트가 중단되었습니다: '${toolName}'` });
        iteration = config.maxIterations;
        loopAborted = true;
        break;
      }

      if (checkResult.action === 'inject') {
        const cachedOutput = checkResult.cachedOutput;
        messages.push({ role: 'tool', content: `[시스템] 도구 반복 호출 감지: '${toolName}'을 동일한 입력으로 이미 호출했습니다.\n이전 결과: ${cachedOutput}\n동일한 도구 호출을 반복하지 말고 다른 접근 방식을 시도하세요.` });
        tracker.record(toolName, toolArgs, cachedOutput);
        continue;
      }

      // 승인 필요 시 순차 처리
      if (needsApproval) {
        const isDangerous = DANGEROUS_TOOLS.includes(toolName);
        if (config.toolApprovalMode === 'confirm' || (config.toolApprovalMode === 'deny-dangerous' && isDangerous)) {
          const confirmId = `${Date.now()}-${toolName}`;
          yield { type: 'tool_confirm', data: { tool: toolName, input: toolArgs, confirmId } };
          if (config.onToolApproval) {
            const approved = await config.onToolApproval(toolName, toolArgs, confirmId);
            if (!approved) {
              messages.push({ role: 'tool', content: `도구 "${toolName}" 실행이 사용자에 의해 거부되었습니다.` });
              yield { type: 'tool_end', data: { tool: toolName, output: '사용자가 거부함', success: false } };
              continue;
            }
          }
        }
      }

      pendingTools.push(tc);
    }

    if (!loopAborted && pendingTools.length > 0) {
      // 도구 시작 이벤트 발행
      for (const tc of pendingTools) {
        yield { type: 'tool_start', data: { tool: tc.function.name, input: tc.function.arguments } };
      }

      // 독립적인 도구들을 병렬 실행 (미들웨어 적용)
      const execResults = await Promise.all(
        pendingTools.map(async (tc) => {
          const toolName = tc.function.name;
          let toolArgs = tc.function.arguments;

          // 도구 미들웨어: beforeExecute
          if (toolChain) {
            const beforeResult = await toolChain.runBeforeExecute(toolName, toolArgs);
            if (beforeResult.skip) {
              return {
                output: beforeResult.skipReason || `도구 "${toolName}" 실행이 미들웨어에 의해 건너뛰어졌습니다.`,
                success: false,
                skipped: true,
              };
            }
            toolArgs = beforeResult.args;
          }

          let result: { success: boolean; output: string };
          try {
            result = await toolRegistry.execute(toolName, toolArgs);
          } catch (err) {
            result = {
              output: `도구 실행 실패: ${err instanceof Error ? err.message : 'Unknown'}`,
              success: false,
            };
          }

          // 도구 미들웨어: afterExecute
          if (toolChain) {
            result = await toolChain.runAfterExecute(toolName, toolArgs, result);
          }

          return result;
        })
      );

      for (let i = 0; i < pendingTools.length; i++) {
        const tc = pendingTools[i];
        const toolName = tc.function.name;
        const toolArgs = tc.function.arguments;
        const result = execResults[i];

        // Drain subagent events if tool supports it
        const executedTool = toolRegistry.get(toolName);
        if (executedTool && 'drainEvents' in executedTool) {
          for (const evt of (executedTool as { drainEvents(): AgentEvent[] }).drainEvents()) {
            yield evt;
          }
        }

        let observation = result.output;
        if (result.success && result.output.startsWith('__IMAGE__')) {
          const imageMatch = result.output.match(/__IMAGE__([\s\S]+?)__PROMPT__([\s\S]+)/);
          if (imageMatch) {
            yield { type: 'image', data: { base64: imageMatch[1], prompt: imageMatch[2] } };
            observation = `Image generated successfully for prompt: "${imageMatch[2]}"`;
          }
        }

        yield { type: 'tool_end', data: { tool: toolName, output: observation.slice(0, 2000), success: result.success } };
        messages.push({ role: 'tool', content: observation });
        tracker.record(toolName, toolArgs, observation);

        if (tracker.detectRepeatingPattern()) {
          yield { type: 'loop_detected', data: { toolName, count: 3, message: '동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다.' } };
          iteration = config.maxIterations;
          loopAborted = true;
          break;
        }
      }
    }

    if (loopAborted) break;
  }

  // Max iterations reached
  yield {
    type: 'token',
    data: { content: '최대 반복 횟수에 도달했습니다. 작업을 완료하지 못했을 수 있습니다.' },
  };

  // 미들웨어: afterAgent (fire-and-forget, max iterations 도달 시)
  if (chain) {
    const mwCtx = buildMiddlewareContext(config, messages, userMessage, history, memories);
    chain.runAfterAgent(mwCtx, fullResponse).catch(() => {});
  }

  yield { type: 'done', data: { iterations: config.maxIterations, model: activeModel } };
}

function buildMiddlewareContext(
  config: AgentConfig,
  messages: OllamaChatMessage[],
  userMessage: string,
  history: { role: string; content: string }[],
  memories: string[]
): MiddlewareContext {
  return {
    config,
    messages,
    userMessage,
    history,
    memories,
    metadata: {},
  };
}

function splitIntoChunks(text: string, chunkSize: number = 512): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function trimHistory(
  history: { role: string; content: string }[],
  maxChars: number
): { role: string; content: string }[] {
  let totalChars = 0;
  const result: { role: string; content: string }[] = [];

  // Keep most recent messages first
  for (let i = history.length - 1; i >= 0; i--) {
    const msgChars = history[i].content.length;
    if (totalChars + msgChars > maxChars && result.length > 0) break;
    totalChars += msgChars;
    result.unshift(history[i]);
  }

  return result;
}
