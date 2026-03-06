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
  fallbackModels?: string[];
  activeSkill?: import('@/types/skills').AgentSkill;
  nestingDepth?: number;
  maxNestingDepth?: number;
  format?: 'json' | Record<string, unknown>;
  thinkingMode?: 'off' | 'on' | 'auto';
  thinkingForToolCalls?: boolean;
}

export interface AgentEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'tool_confirm' | 'token' | 'thinking_token' | 'image' | 'done' | 'error' | 'loop_detected' | 'model_fallback' | 'skill_start' | 'skill_step' | 'skill_end' | 'subagent_start' | 'subagent_event' | 'subagent_end';
  data: Record<string, unknown>;
}
