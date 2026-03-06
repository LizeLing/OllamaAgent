import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../registry', () => ({
  toolRegistry: {
    replaceAll: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('../filesystem', () => ({
  FilesystemReadTool: vi.fn(),
  FilesystemWriteTool: vi.fn(),
  FilesystemListTool: vi.fn(),
  FilesystemSearchTool: vi.fn(),
}));

vi.mock('../http-client', () => ({ HttpClientTool: vi.fn() }));
vi.mock('../web-search', () => ({ WebSearchTool: vi.fn() }));
vi.mock('../web-fetch', () => ({ WebFetchTool: vi.fn() }));
vi.mock('../code-executor', () => ({ CodeExecutorTool: vi.fn() }));
vi.mock('../image-generator', () => ({ ImageGeneratorTool: vi.fn() }));
vi.mock('../custom-tool', () => {
  const CustomTool = vi.fn().mockImplementation(function() {
    return { definition: { name: 'custom_test' } };
  });
  return { CustomTool };
});
vi.mock('../mcp-tool', () => {
  const McpTool = vi.fn().mockImplementation(function() {
    return { definition: { name: 'mcp_test' } };
  });
  return { McpTool };
});
vi.mock('@/lib/mcp/client', () => ({
  listTools: vi.fn().mockResolvedValue([
    { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
  ]),
}));

import { toolRegistry } from '../registry';
import { listTools } from '@/lib/mcp/client';

const mockReplaceAll = vi.mocked(toolRegistry.replaceAll);
const mockRegister = vi.mocked(toolRegistry.register);
const mockListTools = vi.mocked(listTools);

describe('initializeTools', () => {
  let initializeTools: typeof import('../init').initializeTools;
  let registerCustomTools: typeof import('../init').registerCustomTools;
  let registerMcpTools: typeof import('../init').registerMcpTools;

  beforeEach(async () => {
    vi.resetModules();
    mockReplaceAll.mockClear();
    mockRegister.mockClear();
    mockListTools.mockClear();

    const mod = await import('../init');
    initializeTools = mod.initializeTools;
    registerCustomTools = mod.registerCustomTools;
    registerMcpTools = mod.registerMcpTools;
  });

  it('모든 기본 도구를 등록한다', async () => {
    await initializeTools(['/tmp'], ['/etc']);
    expect(mockReplaceAll).toHaveBeenCalledWith(expect.any(Array));
    const tools = mockReplaceAll.mock.calls[0][0];
    expect(tools).toHaveLength(8);
  });

  it('동일 config hash면 재초기화를 건너뛴다', async () => {
    await initializeTools(['/tmp'], ['/etc']);
    await initializeTools(['/tmp'], ['/etc']);
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
  });

  it('registerCustomTools가 CustomTool 인스턴스를 생성한다', async () => {
    registerCustomTools([
      {
        id: 't1', name: 'api1', description: 'API 1',
        url: 'http://example.com', method: 'GET', parameters: [],
      },
    ]);
    expect(mockRegister).toHaveBeenCalled();
  });

  it('registerMcpTools가 enabled 서버만 처리한다', async () => {
    await registerMcpTools([
      { id: 's1', name: 'Server 1', url: 'http://localhost:3001', transport: 'sse', enabled: true },
      { id: 's2', name: 'Server 2', url: 'http://localhost:3002', transport: 'sse', enabled: false },
    ]);
    expect(mockListTools).toHaveBeenCalledTimes(1);
    expect(mockListTools).toHaveBeenCalledWith('http://localhost:3001');
  });

  it('동시 초기화를 방지한다', async () => {
    // Use distinct config so it doesn't hit hash cache from prior test
    const p1 = initializeTools(['/home'], ['/var']);
    const p2 = initializeTools(['/home'], ['/var']);
    await Promise.all([p1, p2]);
    // initPromise guard prevents second init
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
  });

  it('webSearchProvider와 ollamaApiKey를 전달하면 config hash가 달라진다', async () => {
    await initializeTools(['/data'], ['/sys'], 'http://localhost:8888', 'http://localhost:11434', 'sd', 'ollama', 'test-key');
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);

    // Same params should not re-initialize
    await initializeTools(['/data'], ['/sys'], 'http://localhost:8888', 'http://localhost:11434', 'sd', 'ollama', 'test-key');
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
  });

  it('ollamaApiKey가 있으면 WebFetchTool이 추가된다 (9개 도구)', async () => {
    await initializeTools(['/fetch'], ['/no'], 'http://localhost:8888', 'http://localhost:11434', 'sd', 'ollama', 'api-key-123');
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
    const tools = mockReplaceAll.mock.calls[0][0];
    expect(tools).toHaveLength(9);
  });

  it('ollamaApiKey가 없으면 기본 8개 도구만 등록된다', async () => {
    await initializeTools(['/nofetch'], ['/no'], 'http://localhost:8888', 'http://localhost:11434', 'sd', 'searxng', '');
    expect(mockReplaceAll).toHaveBeenCalledTimes(1);
    const tools = mockReplaceAll.mock.calls[0][0];
    expect(tools).toHaveLength(8);
  });
});
