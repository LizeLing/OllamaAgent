import { Conversation, ConversationMeta } from '@/types/conversation';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';

const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const INDEX_FILE = path.join(CONVERSATIONS_DIR, 'index.json');

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID: ${id}`);
  }
}

export async function readIndex(): Promise<ConversationMeta[]> {
  return safeReadJSON<ConversationMeta[]>(INDEX_FILE, []);
}

async function writeIndex(index: ConversationMeta[]) {
  await atomicWriteJSON(INDEX_FILE, index);
}

export async function listConversations(): Promise<ConversationMeta[]> {
  const index = await readIndex();
  return index.sort((a, b) => {
    // Pinned first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Then by updatedAt
    return b.updatedAt - a.updatedAt;
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    validateId(id);
    const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Conversation file not found or invalid
    return null;
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  validateId(conv.id);

  return withFileLock(INDEX_FILE, async () => {
    const filePath = path.join(CONVERSATIONS_DIR, `${conv.id}.json`);
    await atomicWriteJSON(filePath, conv);

    const index = await readIndex();
    const meta: ConversationMeta = {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length,
      ...(conv.folderId !== undefined && { folderId: conv.folderId }),
      ...(conv.tags !== undefined && { tags: conv.tags }),
      ...(conv.pinned !== undefined && { pinned: conv.pinned }),
    };

    const existing = index.findIndex((c) => c.id === conv.id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }

    await writeIndex(index);
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return withFileLock(INDEX_FILE, async () => {
    try {
      validateId(id);
      const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
      await fs.unlink(filePath);
    } catch (err) {
      logger.warn('CONVERSATIONS', `File not found for deletion: ${id}`, err);
    }

    const index = await readIndex();
    const filtered = index.filter((c) => c.id !== id);
    await writeIndex(filtered);
  });
}

export async function clearFolderFromConversations(folderId: string): Promise<void> {
  return withFileLock(INDEX_FILE, async () => {
    const index = await readIndex();
    let changed = false;

    for (const meta of index) {
      if (meta.folderId === folderId) {
        meta.folderId = undefined;
        changed = true;

        try {
          const filePath = path.join(CONVERSATIONS_DIR, `${meta.id}.json`);
          const conv = await safeReadJSON(filePath, null);
          if (conv && typeof conv === 'object') {
            delete (conv as Record<string, unknown>).folderId;
            await atomicWriteJSON(filePath, conv);
          }
        } catch (err) {
          logger.warn('CONVERSATIONS', `Failed to update conversation ${meta.id}`, err);
        }
      }
    }

    if (changed) {
      await writeIndex(index);
    }
  });
}

export interface SearchResult extends ConversationMeta {
  matchedSnippet?: string;
  matchType: 'title' | 'content';
}

const MAX_SEARCH_RESULTS = 50;
const SEARCH_BATCH_SIZE = 10;

export async function searchConversations(query: string): Promise<SearchResult[]> {
  const index = await readIndex();
  const lowerQuery = query.toLowerCase();

  const results: SearchResult[] = [];

  // Title matches
  for (const meta of index) {
    if (meta.title.toLowerCase().includes(lowerQuery)) {
      results.push({ ...meta, matchType: 'title' });
    }
  }

  // Content matches (skip already matched by title) — 배치 병렬 읽기
  const titleMatchIds = new Set(results.map((r) => r.id));
  const candidates = index.filter((m) => !titleMatchIds.has(m.id));

  // 최신순 정렬 후 배치 단위로 병렬 검색
  candidates.sort((a, b) => b.updatedAt - a.updatedAt);

  for (let i = 0; i < candidates.length && results.length < MAX_SEARCH_RESULTS; i += SEARCH_BATCH_SIZE) {
    const batch = candidates.slice(i, i + SEARCH_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (meta) => {
        const conv = await getConversation(meta.id);
        if (!conv) return null;
        for (const msg of conv.messages) {
          const idx = msg.content.toLowerCase().indexOf(lowerQuery);
          if (idx !== -1) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(msg.content.length, idx + query.length + 50);
            const snippet = (start > 0 ? '...' : '') +
              msg.content.slice(start, end) +
              (end < msg.content.length ? '...' : '');
            return { ...meta, matchType: 'content' as const, matchedSnippet: snippet };
          }
        }
        return null;
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
        if (results.length >= MAX_SEARCH_RESULTS) break;
      } else if (r.status === 'rejected') {
        logger.warn('CONVERSATIONS', 'Failed to search conversation', r.reason);
      }
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
