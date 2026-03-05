import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

export function createTestDataDir(): string {
  const dir = path.join(os.tmpdir(), `ollama-agent-test-${uuidv4()}`);
  return dir;
}

export async function ensureTestDataDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function cleanupTestDataDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Sets DATA_DIR to a temp directory for test isolation.
 * Returns a cleanup function.
 */
export async function setupTestDataDir(): Promise<{
  dataDir: string;
  cleanup: () => Promise<void>;
}> {
  const dataDir = createTestDataDir();
  await ensureTestDataDir(dataDir);

  const originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  return {
    dataDir,
    cleanup: async () => {
      if (originalDataDir !== undefined) {
        process.env.DATA_DIR = originalDataDir;
      } else {
        delete process.env.DATA_DIR;
      }
      await cleanupTestDataDir(dataDir);
    },
  };
}
