import { describe, it, expect, vi } from 'vitest';
import { HttpClientTool } from '../http-client';

// Mock global fetch
vi.stubGlobal('fetch', vi.fn());

describe('HttpClientTool SSRF prevention', () => {
  const tool = new HttpClientTool();

  it('blocks localhost', async () => {
    const result = await tool.execute({ url: 'http://localhost:8080/secret' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('내부 네트워크');
  });

  it('blocks 127.0.0.1', async () => {
    const result = await tool.execute({ url: 'http://127.0.0.1/admin' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('사설 IP');
  });

  it('blocks private IP 192.168.x.x', async () => {
    const result = await tool.execute({ url: 'http://192.168.1.1/' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('사설 IP');
  });

  it('blocks private IP 10.x.x.x', async () => {
    const result = await tool.execute({ url: 'http://10.0.0.1/' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('사설 IP');
  });

  it('blocks metadata service', async () => {
    const result = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('사설 IP');
  });

  it('blocks non-HTTP protocols', async () => {
    const result = await tool.execute({ url: 'ftp://example.com/file' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('HTTP/HTTPS');
  });

  it('requires url parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.output).toContain('url');
  });
});
