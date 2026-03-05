import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  FilesystemReadTool,
  FilesystemWriteTool,
  FilesystemListTool,
  FilesystemSearchTool,
} from '../filesystem';

let tempDir: string;

beforeAll(async () => {
  tempDir = path.join(os.tmpdir(), `fs-integration-${uuidv4()}`);
  await fs.mkdir(tempDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe('FilesystemReadTool Integration', () => {
  const tool = new FilesystemReadTool([os.tmpdir()], ['/etc']);

  it('reads a real file', async () => {
    const filePath = path.join(tempDir, 'read-test.txt');
    await fs.writeFile(filePath, 'Hello, integration test!');

    const result = await tool.execute({ path: filePath });
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello, integration test!');
  });

  it('returns error for denied path', async () => {
    const result = await tool.execute({ path: '/etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Access denied');
  });

  it('returns error for nonexistent file', async () => {
    const result = await tool.execute({
      path: path.join(tempDir, 'nonexistent.txt'),
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to read file');
  });
});

describe('FilesystemWriteTool Integration', () => {
  const tool = new FilesystemWriteTool([os.tmpdir()], ['/etc']);

  it('writes a file and verifies content', async () => {
    const filePath = path.join(tempDir, 'write-test.txt');
    const result = await tool.execute({
      path: filePath,
      content: 'Written by integration test',
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Written by integration test');
  });

  it('creates subdirectory automatically', async () => {
    const filePath = path.join(tempDir, 'sub', 'dir', 'deep.txt');
    const result = await tool.execute({
      path: filePath,
      content: 'Deep file',
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Deep file');
  });

  it('returns error for denied path', async () => {
    const result = await tool.execute({
      path: '/etc/test-write.txt',
      content: 'should fail',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Access denied');
  });
});

describe('FilesystemListTool Integration', () => {
  const tool = new FilesystemListTool([os.tmpdir()], ['/etc']);

  it('lists a real directory', async () => {
    // Create some files
    await fs.writeFile(path.join(tempDir, 'list-a.txt'), 'a');
    await fs.writeFile(path.join(tempDir, 'list-b.txt'), 'b');

    const result = await tool.execute({ path: tempDir });
    expect(result.success).toBe(true);

    const items = JSON.parse(result.output);
    expect(Array.isArray(items)).toBe(true);

    const names = items.map((i: { name: string }) => i.name);
    expect(names).toContain('list-a.txt');
    expect(names).toContain('list-b.txt');
  });

  it('shows directories with correct type', async () => {
    const result = await tool.execute({ path: tempDir });
    const items = JSON.parse(result.output);
    const subDir = items.find((i: { name: string }) => i.name === 'sub');
    if (subDir) {
      expect(subDir.type).toBe('directory');
    }
  });
});

describe('FilesystemSearchTool Integration', () => {
  const tool = new FilesystemSearchTool([os.tmpdir()], ['/etc']);

  it('searches with glob pattern in temp dir', async () => {
    const result = await tool.execute({
      pattern: '*.txt',
      cwd: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('.txt');
  });

  it('returns no files for unmatched pattern', async () => {
    const result = await tool.execute({
      pattern: '*.xyz_nonexistent',
      cwd: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('No files found');
  });
});
