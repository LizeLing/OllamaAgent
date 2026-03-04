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

let initialized = false;

export function initializeTools(
  allowedPaths: string[],
  deniedPaths: string[],
  searxngUrl: string = 'http://localhost:8888',
  ollamaUrl: string = 'http://localhost:11434',
  imageModel: string = 'x/z-image-turbo:latest'
) {
  if (initialized) return;

  toolRegistry.register(new FilesystemReadTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemWriteTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemListTool(allowedPaths, deniedPaths));
  toolRegistry.register(new FilesystemSearchTool(allowedPaths, deniedPaths));
  toolRegistry.register(new HttpClientTool());
  toolRegistry.register(new WebSearchTool(searxngUrl));
  toolRegistry.register(new CodeExecutorTool());
  toolRegistry.register(new ImageGeneratorTool(ollamaUrl, imageModel));

  initialized = true;
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

export function resetTools() {
  initialized = false;
}
