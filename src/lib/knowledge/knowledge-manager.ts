import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VectorEngine } from '@/lib/storage/vector-engine';
import { getEmbedding } from '@/lib/memory/embedder';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { DATA_DIR } from '@/lib/config/constants';
import { parseDocument, detectFormat } from './document-parser';
import { chunkSections } from './chunk-strategy';
import { logger } from '@/lib/logger';
import type { Collection, KnowledgeDocument, SearchResultWithSource, ChunkMetadata } from '@/types/knowledge';

const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const COLLECTIONS_FILE = path.join(KNOWLEDGE_DIR, 'collections.json');
const DOCUMENTS_FILE = path.join(KNOWLEDGE_DIR, 'documents.json');

export class KnowledgeManager {
  private engine: VectorEngine;

  constructor(
    private ollamaUrl: string,
    private embeddingModel: string
  ) {
    this.engine = new VectorEngine('knowledge');
  }

  // --- 컬렉션 ---

  async createCollection(name: string): Promise<string> {
    return withFileLock(COLLECTIONS_FILE, async () => {
      const collections = await safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
      const id = uuidv4();
      collections.push({ id, name, createdAt: Date.now() });
      await atomicWriteJSON(COLLECTIONS_FILE, collections);
      return id;
    });
  }

  async listCollections(): Promise<Collection[]> {
    return safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
  }

  async deleteCollection(id: string): Promise<void> {
    const collections = await safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
    const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);

    const docsToDelete = documents.filter((d) => d.collectionId === id);
    for (const doc of docsToDelete) {
      for (const chunkId of doc.chunkIds) {
        await this.engine.deleteVector(chunkId);
      }
    }

    const remainingDocs = documents.filter((d) => d.collectionId !== id);
    const remainingColls = collections.filter((c) => c.id !== id);

    await atomicWriteJSON(DOCUMENTS_FILE, remainingDocs);
    await atomicWriteJSON(COLLECTIONS_FILE, remainingColls);
  }

  // --- 문서 ---

  async addDocument(collectionId: string, filename: string, content: Buffer): Promise<string> {
    const format = detectFormat(filename);
    const sections = await parseDocument(filename, content);
    const chunks = chunkSections(sections);

    const savedChunkIds: string[] = [];
    const docId = uuidv4();

    try {
      for (const chunk of chunks) {
        const embedding = await getEmbedding(this.ollamaUrl, this.embeddingModel, chunk.text);
        const metadata: ChunkMetadata = {
          documentId: docId,
          collectionId,
          chunkIndex: chunk.chunkIndex,
          source: chunk.source,
          filename,
        };
        const chunkId = await this.engine.addVector(chunk.text, embedding, metadata as unknown as Record<string, unknown>);
        savedChunkIds.push(chunkId);
      }
    } catch (err) {
      logger.warn('KNOWLEDGE', `Document add failed, rolling back ${savedChunkIds.length} chunks`, err);
      for (const chunkId of savedChunkIds) {
        await this.engine.deleteVector(chunkId).catch(() => {});
      }
      throw err;
    }

    return withFileLock(DOCUMENTS_FILE, async () => {
      const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
      documents.push({
        id: docId,
        collectionId,
        filename,
        format,
        fileSize: content.length,
        chunkCount: chunks.length,
        chunkIds: savedChunkIds,
        createdAt: Date.now(),
      });
      await atomicWriteJSON(DOCUMENTS_FILE, documents);
      return docId;
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    return withFileLock(DOCUMENTS_FILE, async () => {
      const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;

      for (const chunkId of doc.chunkIds) {
        await this.engine.deleteVector(chunkId);
      }

      const remaining = documents.filter((d) => d.id !== documentId);
      await atomicWriteJSON(DOCUMENTS_FILE, remaining);
    });
  }

  async listDocuments(collectionId: string): Promise<KnowledgeDocument[]> {
    const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
    return documents.filter((d) => d.collectionId === collectionId);
  }

  // --- 검색 ---

  async search(query: string, topK: number = 5): Promise<SearchResultWithSource[]> {
    try {
      const queryVector = await getEmbedding(this.ollamaUrl, this.embeddingModel, query);
      const results = await this.engine.searchVectors(queryVector, topK);

      return results.map((r) => ({
        text: r.text,
        similarity: r.similarity,
        source: (r.metadata?.source as string) || '',
        filename: (r.metadata?.filename as string) || '',
        documentId: (r.metadata?.documentId as string) || '',
        collectionId: (r.metadata?.collectionId as string) || '',
      }));
    } catch (err) {
      logger.error('KNOWLEDGE', 'Search failed', err);
      return [];
    }
  }
}
