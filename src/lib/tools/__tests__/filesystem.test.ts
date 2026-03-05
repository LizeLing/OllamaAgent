import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn(),
  },
}));

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

import fs from 'fs/promises';
import { glob } from 'glob';
import { FilesystemReadTool, FilesystemWriteTool, FilesystemListTool, FilesystemSearchTool } from '../filesystem';

describe('FilesystemReadTool', () => {
  const allowedPaths = ['/tmp', '/home'];
  const deniedPaths = ['/etc'];

  beforeEach(() => { vi.clearAllMocks(); });

  it('path가 없으면 에러를 반환한다', async () => {
    const tool = new FilesystemReadTool(allowedPaths, deniedPaths);
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.output).toContain('path is required');
  });

  it('허용된 경로의 파일을 읽는다', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce('file content');
    const tool = new FilesystemReadTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/tmp/test.txt' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('file content');
  });

  it('거부된 경로에 대해 Access denied 에러를 반환한다', async () => {
    const tool = new FilesystemReadTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Access denied');
  });

  it('10K 이상의 파일 내용을 truncate한다', async () => {
    const longContent = 'x'.repeat(15000);
    vi.mocked(fs.readFile).mockResolvedValueOnce(longContent);
    const tool = new FilesystemReadTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/tmp/big.txt' });
    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(10000 + '\n... (truncated)'.length);
    expect(result.output).toContain('truncated');
  });

  it('allowedPaths가 비어있으면 denied가 아닌 모든 경로를 허용한다', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce('content');
    const tool = new FilesystemReadTool([], deniedPaths);
    const result = await tool.execute({ path: '/anywhere/file.txt' });
    expect(result.success).toBe(true);
  });
});

describe('FilesystemWriteTool', () => {
  const allowedPaths = ['/tmp'];
  const deniedPaths = ['/etc'];

  beforeEach(() => { vi.clearAllMocks(); });

  it('파일을 쓰고 디렉토리를 생성한다', async () => {
    const tool = new FilesystemWriteTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/tmp/new/file.txt', content: 'hello' });
    expect(result.success).toBe(true);
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/new', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/new/file.txt', 'hello', 'utf-8');
  });

  it('거부된 경로에 쓰기를 차단한다', async () => {
    const tool = new FilesystemWriteTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/etc/passwd', content: 'hack' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Access denied');
  });

  it('path와 content가 필수이다', async () => {
    const tool = new FilesystemWriteTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/tmp/test.txt' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });
});

describe('FilesystemListTool', () => {
  const allowedPaths = ['/tmp'];
  const deniedPaths = ['/etc'];

  beforeEach(() => { vi.clearAllMocks(); });

  it('디렉토리 항목을 타입과 함께 나열한다', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'file.txt', isDirectory: () => false },
      { name: 'subdir', isDirectory: () => true },
    ] as never);
    const tool = new FilesystemListTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/tmp' });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed).toEqual([
      { name: 'file.txt', type: 'file' },
      { name: 'subdir', type: 'directory' },
    ]);
  });

  it('거부된 경로를 차단한다', async () => {
    const tool = new FilesystemListTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ path: '/etc' });
    expect(result.success).toBe(false);
  });

  it('path가 필수이다', async () => {
    const tool = new FilesystemListTool(allowedPaths, deniedPaths);
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.output).toContain('path is required');
  });
});

describe('FilesystemSearchTool', () => {
  const allowedPaths = ['/tmp'];
  const deniedPaths = ['/etc'];

  beforeEach(() => { vi.clearAllMocks(); });

  it('glob 패턴으로 파일을 검색한다', async () => {
    vi.mocked(glob).mockResolvedValueOnce(['/tmp/a.ts', '/tmp/b.ts']);
    const tool = new FilesystemSearchTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ pattern: '**/*.ts', cwd: '/tmp' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('/tmp/a.ts');
    expect(result.output).toContain('/tmp/b.ts');
  });

  it('50 파일 제한을 적용한다', async () => {
    const files = Array.from({ length: 60 }, (_, i) => `/tmp/file${i}.ts`);
    vi.mocked(glob).mockResolvedValueOnce(files);
    const tool = new FilesystemSearchTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ pattern: '**/*.ts', cwd: '/tmp' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('and 10 more files');
  });

  it('pattern과 cwd가 필수이다', async () => {
    const tool = new FilesystemSearchTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ pattern: '**/*.ts' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });

  it('결과가 없으면 No files found를 반환한다', async () => {
    vi.mocked(glob).mockResolvedValueOnce([]);
    const tool = new FilesystemSearchTool(allowedPaths, deniedPaths);
    const result = await tool.execute({ pattern: '**/*.xyz', cwd: '/tmp' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('No files found');
  });
});
