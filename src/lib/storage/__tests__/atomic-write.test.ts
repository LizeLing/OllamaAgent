import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { atomicWriteJSON, safeReadJSON } from '../atomic-write';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('atomicWriteJSON', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('JSON 파일을 올바르게 쓴다', async () => {
    const filePath = path.join(tmpDir, 'test.json');
    const data = { hello: 'world', count: 42 };

    await atomicWriteJSON(filePath, data);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual(data);
  });

  it('디렉토리가 없으면 자동 생성한다', async () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'test.json');

    await atomicWriteJSON(filePath, { nested: true });

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ nested: true });
  });

  it('기존 파일을 덮어쓴다', async () => {
    const filePath = path.join(tmpDir, 'overwrite.json');

    await atomicWriteJSON(filePath, { version: 1 });
    await atomicWriteJSON(filePath, { version: 2 });

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ version: 2 });
  });

  it('임시 파일이 남지 않는다', async () => {
    const filePath = path.join(tmpDir, 'clean.json');

    await atomicWriteJSON(filePath, { clean: true });

    const files = await fs.readdir(tmpDir);
    expect(files).toEqual(['clean.json']);
  });
});

describe('safeReadJSON', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-read-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('존재하는 파일을 올바르게 읽는다', async () => {
    const filePath = path.join(tmpDir, 'data.json');
    await fs.writeFile(filePath, JSON.stringify({ key: 'value' }));

    const result = await safeReadJSON(filePath, { key: 'default' });
    expect(result).toEqual({ key: 'value' });
  });

  it('파일이 없으면 기본값을 반환한다', async () => {
    const filePath = path.join(tmpDir, 'missing.json');

    const result = await safeReadJSON(filePath, []);
    expect(result).toEqual([]);
  });

  it('잘못된 JSON이면 기본값을 반환한다', async () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    await fs.writeFile(filePath, 'not valid json{{{');

    const result = await safeReadJSON(filePath, { fallback: true });
    expect(result).toEqual({ fallback: true });
  });
});
