import { z } from 'zod/v4';
import { URL } from 'url';
import net from 'net';

// === SSRF 방지: 내부 IP 대역 차단 ===
const INTERNAL_IP_RANGES = [
  /^127\./,                    // 127.0.0.0/8
  /^10\./,                     // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,               // 192.168.0.0/16
  /^0\./,                      // 0.0.0.0/8
  /^169\.254\./,               // link-local
  /^::1$/,                     // IPv6 loopback
  /^fd/i,                      // IPv6 ULA
  /^fe80/i,                    // IPv6 link-local
];

export function isInternalUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // IPv6 bracket 제거

    // localhost 직접 체크
    if (hostname === 'localhost' || hostname === '::1') return true;

    // IP 주소 패턴 체크
    if (net.isIP(hostname)) {
      return INTERNAL_IP_RANGES.some((re) => re.test(hostname));
    }

    return false;
  } catch {
    return true; // 파싱 실패 시 안전하게 차단
  }
}

// === Custom Tools ===
export const createCustomToolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  bodyTemplate: z.string().max(10000).optional(),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string().default(''),
    required: z.boolean().default(false),
  })).default([]),
});

export const deleteByIdSchema = z.object({
  id: z.string().min(1),
});

// === MCP Servers ===
export const createMcpServerSchema = z.object({
  action: z.literal('test').optional(),
  url: z.string().optional(),
  name: z.string().min(1).max(100).optional(),
  transport: z.enum(['sse', 'stdio']).default('sse'),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

// === Presets ===
export const createPresetSchema = z.object({
  name: z.string().min(1).max(100),
  systemPrompt: z.string().max(10000).default(''),
  enabledTools: z.array(z.string()).default([]),
  model: z.string().optional(),
});

// === Skills ===
export const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  icon: z.string().max(10).optional(),
  triggerCommand: z.string().max(50).optional(),
  systemPromptOverride: z.string().max(10000).optional(),
  enabledTools: z.array(z.string()).default([]),
  model: z.string().optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  workflow: z.array(z.unknown()).default([]),
});

// === Conversations ===
export const createConversationSchema = z.object({
  title: z.string().max(200).default('새 대화'),
  messages: z.array(z.unknown()).default([]),
});

// === Folders ===
export const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).default('#6366f1'),
});

// === Hooks ===
export const createHookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.enum(['on_message_received', 'on_response_complete', 'on_tool_start', 'on_tool_end', 'on_error', 'on_conversation_created']),
  action: z.enum(['webhook', 'log', 'memory_save']),
  actionConfig: z.record(z.string(), z.unknown()),
  filters: z.array(z.unknown()).default([]),
  enabled: z.boolean().default(true),
});

// === Cron ===
export const createCronJobSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  cronExpression: z.string().min(1).max(100),
  jobType: z.enum(['agent_run', 'http_request', 'memory_cleanup', 'health_check']),
  jobConfig: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(false),
});

export const cronStatusActionSchema = z.object({
  action: z.enum(['start', 'stop']),
});

// === Settings ===
export const settingsUpdateSchema = z.object({
  systemPrompt: z.string().max(10000).optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  allowedPaths: z.array(z.string()).optional(),
  deniedPaths: z.array(z.string()).optional(),
  responseLanguage: z.string().max(10).optional(),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  imageModel: z.string().optional(),
  searxngUrl: z.string().optional(),
  autoReadResponses: z.boolean().optional(),
  ttsVoice: z.string().optional(),
  toolApprovalMode: z.enum(['auto', 'confirm', 'deny-dangerous']).optional(),
  customTools: z.array(z.unknown()).optional(),
  mcpServers: z.array(z.unknown()).optional(),
  modelOptions: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    numPredict: z.number().int().min(1).max(32768).optional(),
  }).optional(),
  enabledTools: z.array(z.string()).optional(),
  fallbackModels: z.array(z.string()).optional(),
  thinkingMode: z.enum(['auto', 'on', 'off']).optional(),
  thinkingForToolCalls: z.boolean().optional(),
  webSearchProvider: z.enum(['searxng', 'tavily']).optional(),
  ollamaApiKey: z.string().optional(),
  numParallel: z.number().int().min(1).max(16).optional(),
  maxLoadedModels: z.number().int().min(1).max(16).optional(),
}).passthrough();
