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
  toolApprovalMode?: 'auto' | 'confirm' | 'deny-dangerous';
  onToolApproval?: (toolName: string, args: Record<string, unknown>, confirmId: string) => Promise<boolean>;
  modelOptions?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
  enabledTools?: string[];
}

export interface AgentEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'tool_confirm' | 'token' | 'thinking_token' | 'image' | 'done' | 'error' | 'loop_detected' | 'model_fallback';
  data: Record<string, unknown>;
}
