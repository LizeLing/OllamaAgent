export type CronJobType = 'agent_run' | 'http_request' | 'memory_cleanup' | 'health_check';

export interface AgentRunConfig {
  prompt: string;
  model?: string;
  systemPrompt?: string;
}

export interface HttpRequestConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface MemoryCleanupConfig {
  maxAgeDays: number;
  maxCount: number;
}

export interface HealthCheckConfig {
  notifyUrl?: string;
}

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  jobType: CronJobType;
  jobConfig: AgentRunConfig | HttpRequestConfig | MemoryCleanupConfig | HealthCheckConfig;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
}

export interface CronRunResult {
  jobId: string;
  startedAt: number;
  completedAt: number;
  success: boolean;
  output?: string;
  error?: string;
}
