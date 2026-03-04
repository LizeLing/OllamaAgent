import { ToolCall } from './types';

/**
 * Parse <tool_call> XML tags from model output.
 * Returns array of tool calls found and the remaining text.
 */
export function parseToolCalls(content: string): {
  toolCalls: ToolCall[];
  textContent: string;
} {
  const toolCalls: ToolCall[] = [];
  let textContent = content;

  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.name && typeof parsed.name === 'string') {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || {},
        });
      }
    } catch {
      // Skip malformed tool calls
    }
    textContent = textContent.replace(match[0], '').trim();
  }

  return { toolCalls, textContent };
}

/**
 * Check if the model response contains a tool call.
 */
export function hasToolCall(content: string): boolean {
  return /<tool_call>/.test(content);
}
