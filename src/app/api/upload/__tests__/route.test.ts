import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/middleware/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => true),
  RATE_LIMITS: { upload: { maxTokens: 10, refillPerSecond: 1 } },
}));

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(() =>
    Promise.resolve({
      ollamaUrl: 'http://localhost:11434',
      embeddingModel: 'nomic-embed-text',
    }),
  ),
}));

vi.mock('@/lib/memory/memory-manager', () => ({
  MemoryManager: vi.fn(() => ({
    saveMemory: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { POST } from '../route';
import { checkRateLimit } from '@/lib/middleware/rate-limiter';

function makeFileRequest(filename: string, content: string | Uint8Array): NextRequest {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const file = new File([data], filename);

  const req = new NextRequest('http://localhost:3000/api/upload', { method: 'POST' });
  // Override formData to return our controlled File
  vi.spyOn(req, 'formData').mockResolvedValue(
    (() => {
      const fd = new FormData();
      fd.set('file', file);
      return fd;
    })()
  );
  return req;
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it('텍스트 파일은 content를 반환한다', async () => {
    const res = await POST(makeFileRequest('test.txt', 'hello world'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.originalName).toBe('test.txt');
    expect(data.content).toBe('hello world');
    expect(data.imageBase64).toBeUndefined();
    expect(data.isImage).toBe(false);
  });

  it('이미지 파일(.png)은 imageBase64를 반환한다', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const res = await POST(makeFileRequest('photo.png', imageBytes));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.originalName).toBe('photo.png');
    expect(data.isImage).toBe(true);
    expect(data.imageBase64).toBeDefined();
    expect(typeof data.imageBase64).toBe('string');
    expect(data.content).toBeUndefined();
  });

  it('이미지 파일(.jpg)도 imageBase64를 반환한다', async () => {
    const res = await POST(makeFileRequest('photo.jpg', new Uint8Array([0xFF, 0xD8])));
    const data = await res.json();

    expect(data.isImage).toBe(true);
    expect(data.imageBase64).toBeDefined();
  });

  it('이미지 파일(.jpeg)도 imageBase64를 반환한다', async () => {
    const res = await POST(makeFileRequest('img.jpeg', new Uint8Array([0xFF, 0xD8])));
    const data = await res.json();

    expect(data.isImage).toBe(true);
    expect(data.imageBase64).toBeDefined();
  });

  it('이미지 파일(.webp)도 imageBase64를 반환한다', async () => {
    const res = await POST(makeFileRequest('img.webp', new Uint8Array([0x52, 0x49])));
    const data = await res.json();

    expect(data.isImage).toBe(true);
    expect(data.imageBase64).toBeDefined();
  });

  it('이미지 파일(.gif)도 imageBase64를 반환한다', async () => {
    const res = await POST(makeFileRequest('anim.gif', new Uint8Array([0x47, 0x49])));
    const data = await res.json();

    expect(data.isImage).toBe(true);
    expect(data.imageBase64).toBeDefined();
  });

  it('기타 바이너리 파일은 content도 imageBase64도 없다', async () => {
    const res = await POST(makeFileRequest('archive.zip', new Uint8Array([0x50, 0x4B])));
    const data = await res.json();

    expect(data.content).toBeUndefined();
    expect(data.imageBase64).toBeUndefined();
  });

  it('rate limit 초과 시 429를 반환한다', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(false);
    const res = await POST(makeFileRequest('test.txt', 'data'));

    expect(res.status).toBe(429);
  });

  it('파일이 없으면 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/upload', { method: 'POST' });
    vi.spyOn(req, 'formData').mockResolvedValue(new FormData());
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('허용되지 않는 확장자는 400을 반환한다', async () => {
    const res = await POST(makeFileRequest('malware.exe', 'bad'));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('.exe');
  });

  it('JSON 파일은 텍스트로 처리된다', async () => {
    const res = await POST(makeFileRequest('data.json', '{"key":"value"}'));
    const data = await res.json();

    expect(data.content).toBe('{"key":"value"}');
    expect(data.isImage).toBe(false);
  });

  it('imageBase64는 유효한 base64 문자열이다', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255]);
    const res = await POST(makeFileRequest('test.png', bytes));
    const data = await res.json();

    expect(data.imageBase64).toBeDefined();
    // Verify it decodes back to original bytes
    const decoded = Buffer.from(data.imageBase64, 'base64');
    expect(decoded).toEqual(Buffer.from(bytes));
  });
});
