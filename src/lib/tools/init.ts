import { toolRegistry } from './registry';
import {
  FilesystemReadTool,
  FilesystemWriteTool,
  FilesystemListTool,
  FilesystemSearchTool,
} from './filesystem';
import { HttpClientTool } from './http-client';
import { WebSearchTool } from './web-search';
import { CodeExecutorTool } from './code-executor';
import { ImageGeneratorTool } from './image-generator';
import { CustomTool } from './custom-tool';
import { McpTool } from './mcp-tool';
import { CustomToolDef, McpServerConfig } from '@/types/settings';
import { listTools } from '@/lib/mcp/client';

let lastConfigHash = '';

export function initializeTools(
  allowedPaths: string[],
  deniedPaths: string[],
  searxngUrl: string = 'http://localhost:8888',
  ollamaUrl: string = 'http://localhost:11434',
  imageModel: string = 'x/z-image-turbo:latest'
) {
  // 설정이 동일하면 재등록 스킵 (성능 최적화)
  const configHash = JSON.stringify({ allowedPaths, deniedPaths, searxngUrl, ollamaUrl, imageModel });
  if (configHash === lastConfigHash) return;

  toolRegistry.clear();

  toolRegistry.register(new FilesystemReadTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemWriteTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemListTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemSearchTool(allowedPaths, deniedPaths));
  toolRegistry.register(new HttpClientTool());
  toolRegistry.register(new WebSearchTool(searxngUrl));
  toolRegistry.register(new CodeExecutorTool());
  toolRegistry.register(new ImageGeneratorTool(ollamaUrl, imageModel));

  lastConfigHash = configHash;
}

export function registerCustomTools(customTools: CustomToolDef[]) {
  for (const def of customTools) {
    toolRegistry.register(new CustomTool(def));
  }
}

export async function registerMcpTools(mcpServers: McpServerConfig[]) {
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
}
