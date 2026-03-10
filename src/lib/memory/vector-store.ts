import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cosineSimilarity } from './embedder';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';

interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface IndexEntry {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const VECTORS_DIR = path.join(MEMORY_DIR, 'vectors');
const INDEX_FILE = path.join(MEMORY_DIR, 'index.json');

async function ensureDirs() {
  await fs.mkdir(VECTORS_DIR, { recursive: true });
}

async function loadIndex(): Promise<IndexEntry[]> {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveIndex(index: IndexEntry[]) {
  await ensureDirs();
  await atomicWriteJSON(INDEX_FILE, index);
}

export async function addVector(
  text: string,
  vector: number[],
  metadata?: Record<string, unknown>
): Promise<string> {
  return withFileLock(INDEX_FILE, async () => {
    await ensureDirs();

    const id = uuidv4();
    const entry: VectorEntry = {
      id,
      text,
      vector,
      metadata,
      createdAt: Date.now(),
    };

    await atomicWriteJSON(
      path.join(VECTORS_DIR, `${id}.json`),
      entry
    );

    const index = await loadIndex();
    index.push({ id, text, metadata, createdAt: entry.createdAt });
    await saveIndex(index);

    return id;
  });
}

const SEARCH_BATCH_SIZE = 25;

export async function searchVectors(
  queryVector: number[],
  topK: number = 5,
  threshold: number = 0.3
): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
  await ensureDirs();

  const index = await loadIndex();
  const results: { text: string; similarity: number; metadata?: Record<string, unknown> }[] = [];

  // 배치 병렬 읽기로 I/O 최적화
  for (let i = 0; i < index.length; i += SEARCH_BATCH_SIZE) {
    const batch = index.slice(i, i + SEARCH_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (entry) => {
        const data = await fs.readFile(path.join(VECTORS_DIR, `${entry.id}.json`), 'utf-8');
        const vectorEntry: VectorEntry = JSON.parse(data);
        const similarity = cosineSimilarity(queryVector, vectorEntry.vector);
        return { text: entry.text, similarity, metadata: entry.metadata };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value.similarity >= threshold) {
        results.push(r.value);
      }
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

export async function getMemoryCount(): Promise<number> {
  const index = await loadIndex();
  return index.length;
}

export async function deleteVector(id: string): Promise<void> {
  return withFileLock(INDEX_FILE, async () => {
    try {
      await fs.unlink(path.join(VECTORS_DIR, `${id}.json`));
    } catch (err) {
      logger.warn('VECTOR_STORE', `Vector file not found: ${id}`, err);
    }
    const index = await loadIndex();
    const filtered = index.filter((e) => e.id !== id);
    await saveIndex(filtered);
  });
}

export async function purgeExpiredMemories(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  return withFileLock(INDEX_FILE, async () => {
    const index = await loadIndex();
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    const valid = index.filter((e) => (now - e.createdAt) < maxAgeMs);
    valid.sort((a, b) => b.createdAt - a.createdAt);
    const toKeep = valid.slice(0, maxCount);
    const toKeepIds = new Set(toKeep.map((k) => k.id));
    const toDelete = index.filter((e) => !toKeepIds.has(e.id));

    for (const entry of toDelete) {
      try {
        await fs.unlink(path.join(VECTORS_DIR, `${entry.id}.json`));
      } catch (err) {
        logger.warn('VECTOR_STORE', `Failed to delete vector file: ${entry.id}`, err);
      }
    }

    if (toDelete.length > 0) {
      await saveIndex(toKeep);
    }

    return toDelete.length;
  });
}

interface MemoryListOptions {
  page: number;
  limit: number;
  category?: string;
}

interface MemoryListResult {
  items: IndexEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function getMemoryList(options: MemoryListOptions): Promise<MemoryListResult> {
  const { page, limit, category } = options;
  const index = await loadIndex();

  let filtered = index;
  if (category) {
    filtered = index.filter((e) => e.metadata?.category === category);
  }

  // 최신순 정렬
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return { items, total, page, limit };
}
