// src/lib/memory/vector-store.ts
// VectorEngine("memory") 래퍼 — 기존 함수형 API 시그니처 유지
import { VectorEngine, type IndexEntry } from '@/lib/storage/vector-engine';

export type { IndexEntry };

const engine = new VectorEngine('memory');

export async function addVector(
  text: string,
  vector: number[],
  metadata?: Record<string, unknown>
): Promise<string> {
  return engine.addVector(text, vector, metadata);
}

export async function searchVectors(
  queryVector: number[],
  topK: number = 5,
  threshold: number = 0.3
): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
  return engine.searchVectors(queryVector, topK, threshold);
}

export async function getMemoryCount(): Promise<number> {
  return engine.getVectorCount();
}

export async function deleteVector(id: string): Promise<void> {
  return engine.deleteVector(id);
}

export async function purgeExpiredMemories(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  return engine.purgeExpired(maxAgeDays, maxCount);
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
  return engine.listVectors(options);
}
