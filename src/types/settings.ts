export type ToolApprovalMode = 'auto' | 'confirm' | 'deny-dangerous';

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
}
