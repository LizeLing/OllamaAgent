export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  images?: ImageInfo[];
  attachedImages?: string[];
}

export interface ToolCallInfo {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  success?: boolean;
  startTime: number;
  endTime?: number;
}

export interface ImageInfo {
  base64: string;
  prompt: string;
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
