import { Conversation, ConversationMeta } from '@/types/conversation';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const INDEX_FILE = path.join(CONVERSATIONS_DIR, 'index.json');

async function ensureDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

async function readIndex(): Promise<ConversationMeta[]> {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(index: ConversationMeta[]) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function listConversations(): Promise<ConversationMeta[]> {
  const index = await readIndex();
  return index.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await ensureDir();

  const filePath = path.join(CONVERSATIONS_DIR, `${conv.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(conv, null, 2));

  const index = await readIndex();
  const meta: ConversationMeta = {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
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
    const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
    await fs.unlink(filePath);
  } catch {
    // file may not exist
  }

  const index = await readIndex();
  const filtered = index.filter((c) => c.id !== id);
  await writeIndex(filtered);
}

export async function searchConversations(query: string): Promise<ConversationMeta[]> {
  const index = await readIndex();
  const lowerQuery = query.toLowerCase();

  // First: search titles
  const titleMatches = index.filter((c) =>
    c.title.toLowerCase().includes(lowerQuery)
  );

  // Then: search message content for non-title-matched conversations
  const titleMatchIds = new Set(titleMatches.map((c) => c.id));
  const contentMatches: ConversationMeta[] = [];

  for (const meta of index) {
    if (titleMatchIds.has(meta.id)) continue;
    const conv = await getConversation(meta.id);
    if (!conv) continue;
    const hasMatch = conv.messages.some((m) =>
      m.content.toLowerCase().includes(lowerQuery)
    );
    if (hasMatch) {
      contentMatches.push(meta);
    }
  }

  return [...titleMatches, ...contentMatches].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}
