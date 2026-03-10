import fs from 'fs/promises';

/**
 * 파일 mtime 기반 캐시.
 * 파일의 수정 시각(mtime)이 변경되지 않으면 캐시된 데이터를 반환하고,
 * 변경되었으면 파일을 다시 읽어 파싱한다.
 */
export class MtimeCache<T> {
  private cachedData: T | null = null;
  private lastMtime: number = 0;

  constructor(
    private filePath: string,
    private parser: (content: string) => Promise<T>
  ) {}

  async get(): Promise<T | null> {
    try {
      const stat = await fs.stat(this.filePath);
      const mtime = stat.mtimeMs;

      if (this.cachedData !== null && mtime === this.lastMtime) {
        return this.cachedData;
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      this.cachedData = await this.parser(content);
      this.lastMtime = mtime;
      return this.cachedData;
    } catch {
      return null;
    }
  }

  invalidate(): void {
    this.cachedData = null;
    this.lastMtime = 0;
  }
}
