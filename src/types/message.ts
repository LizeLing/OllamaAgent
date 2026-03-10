export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  images?: ImageInfo[];
  attachedImages?: string[];
  thinkingContent?: string;
  thinkingDuration?: number;
  error?: string;
  aborted?: boolean;
  tokenUsage?: TokenUsage;
  model?: string;
  skillProgress?: { current: number; total: number; skillName: string };
  knowledgeSources?: import('@/types/knowledge').SearchResultWithSource[];
}

export interface ToolCallInfo {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  success?: boolean;
  startTime: number;
  endTime?: number;
  contentIndex?: number;
}

export interface ImageInfo {
  base64: string;
  prompt: string;
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
