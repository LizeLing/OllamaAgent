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
