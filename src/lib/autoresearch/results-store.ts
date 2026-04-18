import { ExperimentEntry } from './types';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import fs from 'fs/promises';
import path from 'path';

const AUTORESEARCH_DIR = path.join(DATA_DIR, 'autoresearch');
const RESULTS_FILE = path.join(AUTORESEARCH_DIR, 'results.json');

async function ensureDir() {
  await fs.mkdir(AUTORESEARCH_DIR, { recursive: true });
}

export async function loadResults(): Promise<ExperimentEntry[]> {
  await ensureDir();
  return safeReadJSON<ExperimentEntry[]>(RESULTS_FILE, []);
}

export async function appendResult(entry: ExperimentEntry): Promise<void> {
  await ensureDir();
  await withFileLock(RESULTS_FILE, async () => {
    const results = await safeReadJSON<ExperimentEntry[]>(RESULTS_FILE, []);
    results.push(entry);
    await atomicWriteJSON(RESULTS_FILE, results);
  });
}

export async function getLatestBaseline(): Promise<ExperimentEntry | null> {
  const results = await loadResults();
  const baselines = results.filter((r) => r.status === 'baseline' || r.status === 'keep');
  return baselines.length > 0 ? baselines[baselines.length - 1] : null;
}

export async function clearResults(): Promise<void> {
  await ensureDir();
  await atomicWriteJSON(RESULTS_FILE, []);
}
