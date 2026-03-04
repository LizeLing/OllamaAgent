export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface ToolResult {
  success: boolean;
  output: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentConfig {
  ollamaUrl: string;
  ollamaModel: string;
  maxIterations: number;
  systemPrompt: string;
  allowedPaths: string[];
  deniedPaths: string[];
}

export interface AgentEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'token' | 'image' | 'done' | 'error';
  data: Record<string, unknown>;
}
