import { Conversation, ConversationMeta } from '@/types/conversation';
import { Message, ToolCallInfo } from '@/types/message';
import { Settings } from '@/types/settings';
import { FolderMeta } from '@/types/folder';
import { AgentConfig } from '@/lib/agent/types';
import { DEFAULT_SETTINGS } from '@/lib/config/constants';
import { v4 as uuidv4 } from 'uuid';

export function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: uuidv4(),
    role: 'user',
    content: 'Hello, world!',
    timestamp: Date.now(),
    ...overrides,
  };
}

export function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: uuidv4(),
    tool: 'filesystem_read',
    input: { path: '/tmp/test.txt' },
    output: 'file content',
    success: true,
    startTime: Date.now(),
    endTime: Date.now() + 100,
    ...overrides,
  };
}

export function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  const now = Date.now();
  return {
    id: uuidv4(),
    title: 'Test Conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
    ...overrides,
  };
}

export function createConversationMeta(overrides: Partial<ConversationMeta> = {}): ConversationMeta {
  const now = Date.now();
  return {
    id: uuidv4(),
    title: 'Test Conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    ...overrides,
  };
}

export function createSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function createFolder(overrides: Partial<FolderMeta> = {}): FolderMeta {
  return {
    id: `folder-${Date.now()}`,
    name: 'Test Folder',
    color: '#3B82F6',
    order: 0,
    ...overrides,
  };
}

export function createAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'qwen3.5:9b',
    maxIterations: 10,
    systemPrompt: 'You are a helpful assistant.',
    allowedPaths: ['/tmp'],
    deniedPaths: ['/etc'],
    toolApprovalMode: 'auto',
    ...overrides,
  };
}
