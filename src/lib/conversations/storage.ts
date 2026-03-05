import { Conversation, ConversationMeta } from '@/types/conversation';
import { DATA_DIR } from '@/lib/config/constants';
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

async function ensureDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

export async function readIndex(): Promise<ConversationMeta[]> {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Index file does not exist yet, return empty list
    return [];
  }
}

async function writeIndex(index: ConversationMeta[]) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
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
  await ensureDir();
  validateId(conv.id);

  const filePath = path.join(CONVERSATIONS_DIR, `${conv.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(conv, null, 2));

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
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    validateId(id);
    const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
    await fs.unlink(filePath);
  } catch {
    // File already deleted or does not exist
  }

  const index = await readIndex();
  const filtered = index.filter((c) => c.id !== id);
  await writeIndex(filtered);
}

export async function clearFolderFromConversations(folderId: string): Promise<void> {
  const index = await readIndex();
  let changed = false;

  for (const meta of index) {
    if (meta.folderId === folderId) {
      meta.folderId = undefined;
      changed = true;

      try {
        const filePath = path.join(CONVERSATIONS_DIR, `${meta.id}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        const conv = JSON.parse(data);
        delete conv.folderId;
        await fs.writeFile(filePath, JSON.stringify(conv, null, 2));
      } catch (err) {
        console.error(`[clearFolder] Failed to update conversation ${meta.id}:`, err);
      }
    }
  }

  if (changed) {
    await writeIndex(index);
  }
}

export interface SearchResult extends ConversationMeta {
  matchedSnippet?: string;
  matchType: 'title' | 'content';
}

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

  // Content matches (skip already matched by title)
  const titleMatchIds = new Set(results.map((r) => r.id));
  for (const meta of index) {
    if (titleMatchIds.has(meta.id)) continue;
    try {
      const conv = await getConversation(meta.id);
      if (!conv) continue;
      for (const msg of conv.messages) {
        const idx = msg.content.toLowerCase().indexOf(lowerQuery);
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(msg.content.length, idx + query.length + 50);
          const snippet = (start > 0 ? '...' : '') +
            msg.content.slice(start, end) +
            (end < msg.content.length ? '...' : '');
          results.push({ ...meta, matchType: 'content', matchedSnippet: snippet });
          break;
        }
      }
    } catch (err) {
      console.error(`[searchConversations] Failed to read conversation ${meta.id}:`, err);
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
