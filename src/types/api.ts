export interface ChatRequest {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  images?: string[];
  model?: string;
  skillId?: string;
  format?: 'json' | Record<string, unknown>;
  planMode?: boolean;
  approvedPlan?: string;
  /** Task Mode 연계: 활성 Task ID (대화 시 resume context 주입용) */
  taskId?: string;
  /** Task Mode 플래그: 'task' 이면 Task 기반 컨텍스트 로딩 */
  taskMode?: 'chat' | 'task';
  /** Task Mode 제어 명령: new/open/checkpoint/execute 등 */
  command?: 'new' | 'open' | 'checkpoint' | 'execute';
  /** command='new'일 때 Task 목표 */
  goal?: string;
}

export interface SSEEvent {
  event:
    | 'thinking'
    | 'tool_start'
    | 'tool_end'
    | 'token'
    | 'image'
    | 'done'
    | 'error'
    | 'knowledge_search'
    | 'plan'
    | 'task_context_loaded';
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
