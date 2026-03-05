import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomTool } from '../custom-tool';
import { CustomToolDef } from '@/types/settings';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createToolDef(overrides: Partial<CustomToolDef> = {}): CustomToolDef {
  return {
    id: 'test-tool',
    name: 'test_api',
    description: 'Test API tool',
    url: 'https://api.example.com/endpoint',
    method: 'POST',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
    ],
    ...overrides,
  };
}

describe('CustomTool', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('GET method: query params를 URL에 추가한다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('result') });
    const tool = new CustomTool(createToolDef({ method: 'GET' }));
    await tool.execute({ query: 'hello world' });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('?query=hello+world');
    expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('POST method: JSON body를 전송한다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('ok') });
    const tool = new CustomTool(createToolDef({ method: 'POST' }));
    await tool.execute({ query: 'test' });

    const body = mockFetch.mock.calls[0][1].body;
    expect(JSON.parse(body)).toEqual({ query: 'test' });
  });

  it('bodyTemplate: {{param}} 플레이스홀더를 치환한다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('ok') });
    const tool = new CustomTool(createToolDef({
      method: 'POST',
      bodyTemplate: '{"search": "{{query}}", "lang": "ko"}',
    }));
    await tool.execute({ query: 'test' });

    const body = mockFetch.mock.calls[0][1].body;
    expect(JSON.parse(body)).toEqual({ search: 'test', lang: 'ko' });
  });

  it('HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });
    const tool = new CustomTool(createToolDef());
    const result = await tool.execute({ query: 'test' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('HTTP 500');
  });

  it('타임아웃 시 에러를 반환한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));
    const tool = new CustomTool(createToolDef());
    const result = await tool.execute({ query: 'test' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('aborted');
  });

  it('definition name에 custom_ prefix가 붙는다', () => {
    const tool = new CustomTool(createToolDef({ name: 'my_tool' }));
    expect(tool.definition.name).toBe('custom_my_tool');
  });
});
