// src/lib/storage/vector-engine.ts
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cosineSimilarity } from '@/lib/memory/embedder';
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

interface ListOptions {
  page: number;
  limit: number;
  category?: string;
}

interface PaginatedResult {
  items: IndexEntry[];
  total: number;
  page: number;
  limit: number;
}

const SEARCH_BATCH_SIZE = 25;

export class VectorEngine {
  readonly namespace: string;
  private readonly baseDir: string;
  private readonly vectorsDir: string;
  private readonly indexFile: string;

  constructor(namespace: string) {
    this.namespace = namespace;
    this.baseDir = path.join(DATA_DIR, namespace);
    this.vectorsDir = path.join(this.baseDir, 'vectors');
    this.indexFile = path.join(this.baseDir, 'index.json');
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.vectorsDir, { recursive: true });
  }

  private async loadIndex(): Promise<IndexEntry[]> {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async saveIndex(index: IndexEntry[]): Promise<void> {
    await this.ensureDirs();
    await atomicWriteJSON(this.indexFile, index);
  }

  async addVector(text: string, vector: number[], metadata?: Record<string, unknown>): Promise<string> {
    return withFileLock(this.indexFile, async () => {
      await this.ensureDirs();
      const id = uuidv4();
      const entry: VectorEntry = { id, text, vector, metadata, createdAt: Date.now() };
      await atomicWriteJSON(path.join(this.vectorsDir, `${id}.json`), entry);
      const index = await this.loadIndex();
      index.push({ id, text, metadata, createdAt: entry.createdAt });
      await this.saveIndex(index);
      return id;
    });
  }

  async searchVectors(queryVector: number[], topK: number = 5, threshold: number = 0.3): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
    await this.ensureDirs();
    const index = await this.loadIndex();
    const results: { text: string; similarity: number; metadata?: Record<string, unknown> }[] = [];
    for (let i = 0; i < index.length; i += SEARCH_BATCH_SIZE) {
      const batch = index.slice(i, i + SEARCH_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (entry) => {
          const data = await fs.readFile(path.join(this.vectorsDir, `${entry.id}.json`), 'utf-8');
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

  async deleteVector(id: string): Promise<void> {
    return withFileLock(this.indexFile, async () => {
      try {
        await fs.unlink(path.join(this.vectorsDir, `${id}.json`));
      } catch (err) {
        logger.warn('VECTOR_ENGINE', `Vector file not found: ${id}`, err);
      }
      const index = await this.loadIndex();
      const filtered = index.filter((e) => e.id !== id);
      await this.saveIndex(filtered);
    });
  }

  async getVectorCount(): Promise<number> {
    const index = await this.loadIndex();
    return index.length;
  }

  async listVectors(options: ListOptions): Promise<PaginatedResult> {
    const { page, limit, category } = options;
    const index = await this.loadIndex();
    let filtered = index;
    if (category) {
      filtered = index.filter((e) => e.metadata?.category === category);
    }
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return { items, total, page, limit };
  }

  async purgeExpired(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
    return withFileLock(this.indexFile, async () => {
      const index = await this.loadIndex();
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      const valid = index.filter((e) => (now - e.createdAt) < maxAgeMs);
      valid.sort((a, b) => b.createdAt - a.createdAt);
      const toKeep = valid.slice(0, maxCount);
      const toKeepIds = new Set(toKeep.map((k) => k.id));
      const toDelete = index.filter((e) => !toKeepIds.has(e.id));
      for (const entry of toDelete) {
        try {
          await fs.unlink(path.join(this.vectorsDir, `${entry.id}.json`));
        } catch (err) {
          logger.warn('VECTOR_ENGINE', `Failed to delete: ${entry.id}`, err);
        }
      }
      if (toDelete.length > 0) {
        await this.saveIndex(toKeep);
      }
      return toDelete.length;
    });
  }
}
