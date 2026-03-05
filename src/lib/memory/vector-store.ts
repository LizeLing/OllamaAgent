import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cosineSimilarity } from './embedder';
import { DATA_DIR } from '@/lib/config/constants';

interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

interface IndexEntry {
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
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function addVector(
  text: string,
  vector: number[],
  metadata?: Record<string, unknown>
): Promise<string> {
  await ensureDirs();

  const id = uuidv4();
  const entry: VectorEntry = {
    id,
    text,
    vector,
    metadata,
    createdAt: Date.now(),
  };

  await fs.writeFile(
    path.join(VECTORS_DIR, `${id}.json`),
    JSON.stringify(entry)
  );

  const index = await loadIndex();
  index.push({ id, text, metadata, createdAt: entry.createdAt });
  await saveIndex(index);

  return id;
}

export async function searchVectors(
  queryVector: number[],
  topK: number = 5,
  threshold: number = 0.3
): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
  await ensureDirs();

  const index = await loadIndex();
  const results: { text: string; similarity: number; metadata?: Record<string, unknown> }[] = [];

  for (const entry of index) {
    try {
      const data = await fs.readFile(path.join(VECTORS_DIR, `${entry.id}.json`), 'utf-8');
      const vectorEntry: VectorEntry = JSON.parse(data);
      const similarity = cosineSimilarity(queryVector, vectorEntry.vector);
      if (similarity >= threshold) {
        results.push({ text: entry.text, similarity, metadata: entry.metadata });
      }
    } catch {
      // Skip corrupted entries
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
  try {
    await fs.unlink(path.join(VECTORS_DIR, `${id}.json`));
  } catch {
    // file may not exist
  }
  const index = await loadIndex();
  const filtered = index.filter((e) => e.id !== id);
  await saveIndex(filtered);
}

export async function purgeExpiredMemories(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  const index = await loadIndex();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const valid = index.filter((e) => (now - e.createdAt) < maxAgeMs);
  valid.sort((a, b) => b.createdAt - a.createdAt);
  const toKeep = valid.slice(0, maxCount);
  const toDelete = index.filter((e) => !toKeep.find((k) => k.id === e.id));

  for (const entry of toDelete) {
    try {
      await fs.unlink(path.join(VECTORS_DIR, `${entry.id}.json`));
    } catch {
      // skip
    }
  }

  if (toDelete.length > 0) {
    await saveIndex(toKeep);
  }

  return toDelete.length;
}
