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

/**
 * Task Mode 실행 시 Worker(서브에이전트)에게 주입되는 컨텍스트.
 * taskContext가 설정되면 Worker는 WorkerResult 구조화 반환 + writeScope 검증 + 부모 승인 정책 계승을 수행한다.
 */
export interface TaskWorkerContext {
  taskId: string;
  taskItemId: string;
  writeScope?: string[];
  allowedTools?: string[];
  workerRole?: import('@/types/task').TaskWorkerRole;
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
  middlewares?: import('./middleware/types').AgentMiddleware[];
  toolMiddlewares?: import('./middleware/types').ToolMiddleware[];
  /** Plan 모드: 쓰기/실행 도구를 차단하고 계획(plan)만 생성한다. */
  planMode?: boolean;
  /** Plan 모드 중 추가로 차단할 도구 이름 (custom destructive 등). */
  planBlockedTools?: string[];
  /** Task Mode Worker 컨텍스트. 설정 시 WorkerResult 구조화 + writeScope 강제. */
  taskContext?: TaskWorkerContext;
}

export interface AgentEvent {
  type:
    | 'thinking'
    | 'tool_start'
    | 'tool_end'
    | 'tool_confirm'
    | 'token'
    | 'thinking_token'
    | 'image'
    | 'done'
    | 'error'
    | 'loop_detected'
    | 'model_fallback'
    | 'skill_start'
    | 'skill_step'
    | 'skill_end'
    | 'subagent_start'
    | 'subagent_event'
    | 'subagent_end'
    | 'subagent_token'
    | 'subagent_thinking_token'
    | 'subagent_tool_start'
    | 'subagent_tool_end'
    | 'subagent_done'
    | 'knowledge_search'
    | 'plan'
    | 'plan_blocked';
  data: Record<string, unknown>;
}
