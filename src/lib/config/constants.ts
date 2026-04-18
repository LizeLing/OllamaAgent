import { Settings } from '@/types/settings';
import path from 'path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: `당신은 유능한 AI 어시스턴트입니다. 사용자의 질문에 정확하고 도움이 되는 답변을 제공합니다. 한국어로 응답하세요.`,
  maxIterations: 10,
  allowedPaths: ['/Users', '/tmp'],
  deniedPaths: ['/etc', '/var', '/usr', '/bin', '/sbin', '/System'],
  responseLanguage: 'ko',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.5:9b',
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:8b',
  imageModel: process.env.OLLAMA_IMAGE_MODEL || 'x/z-image-turbo:latest',
  searxngUrl: process.env.SEARXNG_URL || 'http://localhost:8888',
  autoReadResponses: false,
  ttsVoice: 'ko-KR-SunHiNeural',
  toolApprovalMode: 'auto' as const,
  activePresetId: undefined,
  customTools: [],
  mcpServers: [],
  modelOptions: {
    temperature: 0.7,
    topP: 0.9,
    numPredict: 2048,
  },
  enabledTools: [],
  fallbackModels: [],
  thinkingMode: 'auto' as const,
  thinkingForToolCalls: false,
  webSearchProvider: 'searxng' as const,
  ollamaApiKey: '',
  numParallel: 1,
  maxLoadedModels: 1,
  memoryCategories: {
    technical: { weight: 1.2, maxAgeDays: 60 },
    research: { weight: 1.0, maxAgeDays: 30 },
    preference: { weight: 1.5, maxAgeDays: 90 },
    general: { weight: 0.8, maxAgeDays: 14 },
  },
  defaultPlanMode: false,
};
