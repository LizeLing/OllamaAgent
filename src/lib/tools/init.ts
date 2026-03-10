import { toolRegistry } from './registry';
import {
  FilesystemReadTool,
  FilesystemWriteTool,
  FilesystemListTool,
  FilesystemSearchTool,
} from './filesystem';
import { HttpClientTool } from './http-client';
import { WebSearchTool } from './web-search';
import { WebFetchTool } from './web-fetch';
import { CodeExecutorTool } from './code-executor';
import { ImageGeneratorTool } from './image-generator';
import { CustomTool } from './custom-tool';
import { McpTool } from './mcp-tool';
import { CustomToolDef, McpServerConfig } from '@/types/settings';
import { listTools } from '@/lib/mcp/client';
import { BaseTool } from './base-tool';
import { MtimeCache } from '@/lib/infra/file-cache';
import { DATA_DIR } from '@/lib/config/constants';
import path from 'path';

let lastConfigHash = '';
let initPromise: Promise<void> | null = null;

export async function initializeTools(
  allowedPaths: string[],
  deniedPaths: string[],
  searxngUrl: string = 'http://localhost:8888',
  ollamaUrl: string = 'http://localhost:11434',
  imageModel: string = 'x/z-image-turbo:latest',
  webSearchProvider: 'searxng' | 'ollama' = 'searxng',
  ollamaApiKey: string = ''
) {
  const configHash = JSON.stringify({ allowedPaths, deniedPaths, searxngUrl, ollamaUrl, imageModel, webSearchProvider, ollamaApiKey });
  if (configHash === lastConfigHash) return;

  // Prevent concurrent initialization
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      // Build all tools first, then swap atomically
      const tools: BaseTool[] = [
        new FilesystemReadTool(allowedPaths, deniedPaths),
        new FilesystemWriteTool(allowedPaths, deniedPaths),
        new FilesystemListTool(allowedPaths, deniedPaths),
        new FilesystemSearchTool(allowedPaths, deniedPaths),
        new HttpClientTool(),
        new WebSearchTool({
          provider: webSearchProvider,
          searxngUrl,
          ollamaApiKey,
        }),
        new CodeExecutorTool(),
        new ImageGeneratorTool(ollamaUrl, imageModel),
      ];

      if (ollamaApiKey) {
        tools.push(new WebFetchTool(ollamaApiKey));
      }

      toolRegistry.replaceAll(tools);
      lastConfigHash = configHash;
    } finally {
      initPromise = null;
    }
  })();

  await initPromise;
}

export function registerCustomTools(customTools: CustomToolDef[]) {
  for (const def of customTools) {
    toolRegistry.register(new CustomTool(def));
  }
}

import { DelegateToSubAgentTool } from '@/lib/agent/subagent-tool';
import { AgentConfig } from '@/lib/agent/types';

export function registerSubAgentTool(config: AgentConfig): void {
  toolRegistry.register(new DelegateToSubAgentTool(config));
}

const settingsCache = new MtimeCache<{ mcpServers?: McpServerConfig[] }>(
  path.join(DATA_DIR, 'settings.json'),
  async (content) => JSON.parse(content)
);

let lastMcpConfigHash = '';

export async function registerMcpTools(mcpServers: McpServerConfig[]) {
  // 설정 파일의 mtime을 확인하여 MCP 설정이 변경되지 않았으면 건너뛴다
  const cached = await settingsCache.get();
  const currentHash = JSON.stringify(
    mcpServers.map(s => ({ id: s.id, url: s.url, enabled: s.enabled }))
  );
  if (cached && currentHash === lastMcpConfigHash) {
    return;
  }

  // 기존 MCP 도구 제거 후 재등록
  for (const server of mcpServers) {
    if (!server.enabled) continue;
    try {
      const schemas = await listTools(server.url);
      for (const schema of schemas) {
        toolRegistry.register(new McpTool(server.url, schema));
      }
    } catch {
      // MCP server unavailable, skip
    }
  }
  lastMcpConfigHash = currentHash;
}
