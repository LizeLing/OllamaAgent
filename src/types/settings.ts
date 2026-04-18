export type ToolApprovalMode = 'auto' | 'confirm' | 'deny-dangerous';

export interface MemoryCategoryConfig {
  weight: number;
  maxAgeDays: number;
}

export interface AgentPreset {
  id: string;
  name: string;
  systemPrompt: string;
  enabledTools: string[];
  model?: string;
}

export interface CustomToolDef {
  id: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
  /** true면 Plan 모드에서 자동 차단 */
  destructive?: boolean;
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  enabled: boolean;
}

export interface ModelOptions {
  temperature: number;
  topP: number;
  numPredict: number;
}

export interface Settings {
  systemPrompt: string;
  maxIterations: number;
  allowedPaths: string[];
  deniedPaths: string[];
  responseLanguage: string;
  ollamaUrl: string;
  ollamaModel: string;
  embeddingModel: string;
  imageModel: string;
  searxngUrl: string;
  autoReadResponses: boolean;
  ttsVoice: string;
  toolApprovalMode: ToolApprovalMode;
  activePresetId?: string;
  customTools: CustomToolDef[];
  mcpServers: McpServerConfig[];
  modelOptions: ModelOptions;
  enabledTools?: string[];
  fallbackModels: string[];
  thinkingMode: 'off' | 'on' | 'auto';
  thinkingForToolCalls: boolean;
  webSearchProvider: 'searxng' | 'ollama';
  ollamaApiKey: string;
  numParallel: number;
  maxLoadedModels: number;
  memoryCategories: Record<string, MemoryCategoryConfig>;
  /** 기본 Plan 모드 활성화 여부 (기본: false) */
  defaultPlanMode?: boolean;
}
