import { AgentConfig, AgentEvent } from './types';
import { toolRegistry } from '@/lib/tools/registry';
import { chat, chatStream } from '@/lib/ollama/client';
import { OllamaChatMessage } from '@/lib/ollama/types';

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

  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];

  const tools = toolRegistry.toOllamaTools();

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    yield { type: 'thinking', data: { iteration } };

    // Non-streaming call to check for tool use
    const response = await chat(config.ollamaUrl, {
      model: config.ollamaModel,
      messages,
      stream: false,
      think: false,
      tools,
    });

    const assistantMsg = response.message;
    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // No tool call -> final answer. Stream it for better UX.
      // We already have the full answer, yield in chunks.
      const content = assistantMsg.content || '';

      if (content) {
        const chunks = splitIntoChunks(content, 4);
        for (const chunk of chunks) {
          yield { type: 'token', data: { content: chunk } };
        }
      }

      yield { type: 'done', data: { iterations: iteration + 1 } };
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
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = tc.function.arguments;

      yield { type: 'tool_start', data: { tool: toolName, input: toolArgs } };

      const result = await toolRegistry.execute(toolName, toolArgs);

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
          output: observation.slice(0, 500),
          success: result.success,
        },
      };

      // Add tool response to conversation
      messages.push({
        role: 'tool',
        content: observation,
      });
    }
  }

  // Max iterations reached
  yield {
    type: 'token',
    data: { content: '최대 반복 횟수에 도달했습니다. 작업을 완료하지 못했을 수 있습니다.' },
  };
  yield { type: 'done', data: { iterations: config.maxIterations } };
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}
