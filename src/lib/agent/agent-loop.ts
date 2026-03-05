import { AgentConfig, AgentEvent } from './types';
import { toolRegistry } from '@/lib/tools/registry';
import { chat as rawChat, chatStream } from '@/lib/ollama/client';
import { chatWithFailover } from '@/lib/ollama/failover';
import { OllamaChatMessage } from '@/lib/ollama/types';
import { ToolCallTracker } from './tool-call-tracker';

export async function* runAgentLoop(
  config: AgentConfig,
  userMessage: string,
  history: { role: string; content: string }[],
  memories: string[] = [],
  images: string[] = []
): AsyncGenerator<AgentEvent> {
  // Build system prompt with memories
  let systemPrompt = config.systemPrompt;
  if (memories.length > 0) {
    systemPrompt += '\n\n## 관련 기억\n' + memories.map((m) => `- ${m}`).join('\n');
  }

  const userMsg: OllamaChatMessage = { role: 'user', content: userMessage };
  if (images.length > 0) {
    userMsg.images = images;
  }

  // Trim history to fit context window (~16K chars ≈ 32K tokens)
  const maxHistoryChars = 16000;
  const trimmedHistory = trimHistory(history, maxHistoryChars);

  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];

  const tools = toolRegistry.toOllamaTools(config.enabledTools);
  const tracker = new ToolCallTracker();
  let activeModel = config.ollamaModel;

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    yield { type: 'thinking', data: { iteration } };

    // Non-streaming call to check for tool use (think: false for speed)
    const { result: response, usedModel, failedModels } = await chatWithFailover(
      rawChat, config.ollamaUrl,
      { model: activeModel, messages, stream: false, think: false, tools, options: config.modelOptions },
      config.fallbackModels || []
    );

    if (failedModels.length > 0) {
      yield { type: 'model_fallback', data: { originalModel: activeModel, usedModel, reason: `모델 ${failedModels.join(', ')} 사용 불가` } };
      activeModel = usedModel;
    }

    const assistantMsg = response.message;
    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // No tool call -> final answer. Use chatStream with think: true for thinking tokens.
      const thinkingStartTime = Date.now();
      let hasThinking = false;
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of chatStream(config.ollamaUrl, {
        model: activeModel,
        messages,
        think: true,
        options: config.modelOptions,
      })) {
        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count || 0;
          completionTokens = chunk.eval_count || 0;
        }
        if (chunk.message?.thinking) {
          hasThinking = true;
          yield { type: 'thinking_token', data: { content: chunk.message.thinking } };
        }
        if (chunk.message?.content) {
          yield { type: 'token', data: { content: chunk.message.content } };
        }
      }

      if (hasThinking) {
        const thinkingDuration = Date.now() - thinkingStartTime;
        yield { type: 'thinking_token', data: { done: true, duration: thinkingDuration } };
      }

      yield { type: 'done', data: {
        iterations: iteration + 1,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model: activeModel,
      }};
      return;
    }

    // Yield any text content before tool calls
    if (assistantMsg.content) {
      const chunks = splitIntoChunks(assistantMsg.content, 4);
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

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = tc.function.arguments;

      // Loop detection check (before approval)
      const checkResult = tracker.check(toolName, toolArgs);

      if (checkResult.action === 'abort') {
        yield {
          type: 'loop_detected',
          data: { toolName, count: 3, message: '동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다.' },
        };
        messages.push({
          role: 'tool',
          content: `[시스템] 도구 반복 호출로 인해 에이전트가 중단되었습니다: '${toolName}'`,
        });
        iteration = config.maxIterations;
        loopAborted = true;
        break;
      }

      if (checkResult.action === 'inject') {
        const cachedOutput = checkResult.cachedOutput;
        const redirectMsg = `[시스템] 도구 반복 호출 감지: '${toolName}'을 동일한 입력으로 이미 호출했습니다.\n이전 결과: ${cachedOutput}\n동일한 도구 호출을 반복하지 말고 다른 접근 방식을 시도하세요.`;
        messages.push({
          role: 'tool',
          content: redirectMsg,
        });
        tracker.record(toolName, toolArgs, cachedOutput);
        continue;
      }

      // action === 'execute': proceed with normal execution

      // Check tool approval mode
      if (config.toolApprovalMode && config.toolApprovalMode !== 'auto') {
        const isDangerous = DANGEROUS_TOOLS.includes(toolName);
        if (config.toolApprovalMode === 'confirm' ||
            (config.toolApprovalMode === 'deny-dangerous' && isDangerous)) {
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

      yield { type: 'tool_start', data: { tool: toolName, input: toolArgs } };

      const result = await toolRegistry.execute(toolName, toolArgs);

      // Drain subagent events if tool supports it
      const executedTool = toolRegistry.get(toolName);
      if (executedTool && 'drainEvents' in executedTool) {
        for (const evt of (executedTool as { drainEvents(): AgentEvent[] }).drainEvents()) {
          yield evt;
        }
      }

      // Check if result contains image data
      let observation = result.output;
      if (result.success && result.output.startsWith('__IMAGE__')) {
        const imageMatch = result.output.match(/__IMAGE__([\s\S]+?)__PROMPT__([\s\S]+)/);
        if (imageMatch) {
          yield {
            type: 'image',
            data: { base64: imageMatch[1], prompt: imageMatch[2] },
          };
          observation = `Image generated successfully for prompt: "${imageMatch[2]}"`;
        }
      }

      yield {
        type: 'tool_end',
        data: {
          tool: toolName,
          output: observation.slice(0, 2000),
          success: result.success,
        },
      };

      // Add tool response to conversation
      messages.push({
        role: 'tool',
        content: observation,
      });

      // Record tool call result and check for repeating patterns
      tracker.record(toolName, toolArgs, observation);

      if (tracker.detectRepeatingPattern()) {
        yield {
          type: 'loop_detected',
          data: { toolName, count: 3, message: '동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다.' },
        };
        iteration = config.maxIterations;
        loopAborted = true;
        break;
      }
    }

    if (loopAborted) break;
  }

  // Max iterations reached
  yield {
    type: 'token',
    data: { content: '최대 반복 횟수에 도달했습니다. 작업을 완료하지 못했을 수 있습니다.' },
  };
  yield { type: 'done', data: { iterations: config.maxIterations, model: activeModel } };
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
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
