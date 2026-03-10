import fs from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';

/**
 * 원자적 파일 쓰기: 임시 파일에 기록 후 rename으로 교체.
 * 쓰기 중 크래시해도 기존 파일이 손상되지 않는다.
 */
export async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // 임시 파일 정리
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore cleanup error
    }
    logger.error('ATOMIC_WRITE', `Failed to write ${filePath}`, error);
    throw error;
  }
}

/**
 * 안전한 JSON 파일 읽기. 파일이 없거나 파싱 실패 시 기본값 반환.
 */
export async function safeReadJSON<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}
