import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MCP Client', () => {
  let listTools: typeof import('../client').listTools;
  let callTool: typeof import('../client').callTool;
  let testConnection: typeof import('../client').testConnection;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    const mod = await import('../client');
    listTools = mod.listTools;
    callTool = mod.callTool;
    testConnection = mod.testConnection;
  });

  it('listTools: JSON-RPC tools/list 요청을 전송하고 tools 배열을 반환한다', async () => {
    const tools = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
    ];
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: { tools } }),
    });

    const result = await listTools('http://localhost:3000');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/list');
    expect(result).toEqual(tools);
  });

  it('callTool: JSON-RPC tools/call 요청을 params와 함께 전송한다', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        result: { content: [{ type: 'text', text: 'result' }] },
      }),
    });

    const result = await callTool('http://localhost:3000', 'test_tool', { input: 'hello' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('test_tool');
    expect(body.params.arguments).toEqual({ input: 'hello' });
    expect(result.content[0].text).toBe('result');
  });

  it('callTool: data.error가 있으면 에러 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        error: { message: 'tool failed' },
      }),
    });

    const result = await callTool('http://localhost:3000', 'bad_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('tool failed');
  });

  it('testConnection: 성공 시 tool 개수를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        result: { tools: [{ name: 'a' }, { name: 'b' }] },
      }),
    });

    const result = await testConnection('http://localhost:3000');

    expect(result.success).toBe(true);
    expect(result.tools).toBe(2);
  });

  it('testConnection: 실패 시 에러 메시지를 반환한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await testConnection('http://localhost:3000');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  it('listTools: tools가 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: {} }),
    });

    const result = await listTools('http://localhost:3000');
    expect(result).toEqual([]);
  });
});
