export type HookTrigger =
  | 'on_message_received'
  | 'on_response_complete'
  | 'on_tool_start'
  | 'on_tool_end'
  | 'on_error'
  | 'on_conversation_created';

export type HookAction = 'webhook' | 'log' | 'memory_save';

export interface WebhookActionConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

export interface LogActionConfig {
  filePath: string;
  format?: 'json' | 'text';
}

export interface MemorySaveActionConfig {
  metadataTemplate?: Record<string, string>;
}

export interface HookFilter {
  field: string;
  operator: 'equals' | 'contains' | 'not_equals';
  value: string;
}

export interface EventHook {
  id: string;
  name: string;
  description?: string;
  trigger: HookTrigger;
  action: HookAction;
  actionConfig: WebhookActionConfig | LogActionConfig | MemorySaveActionConfig;
  filters?: HookFilter[];
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  triggerCount: number;
}

export interface HookExecutionResult {
  hookId: string;
  success: boolean;
  error?: string;
  duration: number;
  timestamp: number;
}
