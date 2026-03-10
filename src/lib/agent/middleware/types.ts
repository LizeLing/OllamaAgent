import { OllamaChatMessage } from '@/lib/ollama/types';
import { AgentConfig } from '../types';

export interface MiddlewareContext {
  config: AgentConfig;
  messages: OllamaChatMessage[];
  userMessage: string;
  history: { role: string; content: string }[];
  memories: string[];
  metadata: Record<string, unknown>;
}

export interface AgentMiddleware {
  name: string;
  /** 에이전트 루프 시작 전 */
  beforeAgent?(ctx: MiddlewareContext): Promise<MiddlewareContext>;
  /** 에이전트 루프 종료 후 */
  afterAgent?(ctx: MiddlewareContext, response: string): Promise<void>;
  /** 모델 호출 전 (매 iteration) */
  beforeModel?(ctx: MiddlewareContext): Promise<MiddlewareContext>;
  /** 모델 호출 후 (매 iteration) */
  afterModel?(ctx: MiddlewareContext, toolCalls: ToolCallInfo[]): Promise<ToolCallInfo[]>;
}

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolMiddleware {
  name: string;
  /** 도구 실행 전 */
  beforeExecute?(toolName: string, args: Record<string, unknown>): Promise<{ toolName: string; args: Record<string, unknown>; skip?: boolean; skipReason?: string }>;
  /** 도구 실행 후 */
  afterExecute?(toolName: string, args: Record<string, unknown>, result: { success: boolean; output: string }): Promise<{ success: boolean; output: string }>;
}
