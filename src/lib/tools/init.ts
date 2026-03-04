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

export function resetTools() {
  initialized = false;
}
