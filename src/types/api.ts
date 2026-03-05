export interface ChatRequest {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  images?: string[];
  model?: string;
}

export interface SSEEvent {
  event: 'thinking' | 'tool_start' | 'tool_end' | 'token' | 'image' | 'done' | 'error';
  data: Record<string, unknown>;
}

export interface HealthStatus {
  ollama: boolean;
  searxng: boolean;
  docker: boolean;
  embedding: boolean;
  stt: boolean;
  tts: boolean;
}
