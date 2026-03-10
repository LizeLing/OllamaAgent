import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MtimeCache } from '../file-cache';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('MtimeCache', () => {
  let tmpFile: string;
  let cache: MtimeCache<string[]>;

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `mtime-test-${Date.now()}.json`);
    await fs.writeFile(tmpFile, JSON.stringify(['a', 'b']));
    cache = new MtimeCache(tmpFile, async (content) => JSON.parse(content));
  });

  afterEach(async () => {
    try { await fs.unlink(tmpFile); } catch { /* ignore */ }
  });

  it('첫 호출 시 파일을 읽고 파싱한다', async () => {
    const data = await cache.get();
    expect(data).toEqual(['a', 'b']);
  });

  it('파일 미변경 시 캐시를 반환한다', async () => {
    await cache.get();
    const data = await cache.get();
    expect(data).toEqual(['a', 'b']);
  });

  it('파일 변경 시 재파싱한다', async () => {
    await cache.get();
    // mtime 변경을 보장하기 위해 잠시 대기 후 파일 수정
    await new Promise(r => setTimeout(r, 100));
    await fs.writeFile(tmpFile, JSON.stringify(['c', 'd']));
    const data = await cache.get();
    expect(data).toEqual(['c', 'd']);
  });

  it('파일 없으면 null 반환', async () => {
    const missing = new MtimeCache('/nonexistent-path-12345', async () => []);
    const data = await missing.get();
    expect(data).toBeNull();
  });

  it('invalidate() 후 다시 파일을 읽는다', async () => {
    await cache.get();
    cache.invalidate();
    // invalidate 후에도 파일이 같으면 다시 읽어서 같은 결과
    const data = await cache.get();
    expect(data).toEqual(['a', 'b']);
  });

  it('invalidate() 후 파일이 변경되면 새 데이터를 반환한다', async () => {
    await cache.get();
    cache.invalidate();
    await fs.writeFile(tmpFile, JSON.stringify(['e', 'f']));
    const data = await cache.get();
    expect(data).toEqual(['e', 'f']);
  });
});
