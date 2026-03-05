import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/lib/config/constants';

export interface WebhookApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

const KEYS_FILE = path.join(DATA_DIR, 'webhook-keys.json');
const MAX_KEYS = 10;

export async function loadKeys(): Promise<WebhookApiKey[]> {
  try {
    const data = await fs.readFile(KEYS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveKeys(keys: WebhookApiKey[]): Promise<void> {
  const dir = path.dirname(KEYS_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
}

export async function addKey(key: WebhookApiKey): Promise<void> {
  const keys = await loadKeys();
  if (keys.length >= MAX_KEYS) {
    throw new Error(`Maximum number of API keys (${MAX_KEYS}) reached`);
  }
  keys.push(key);
  await saveKeys(keys);
}

export async function removeKey(id: string): Promise<boolean> {
  const keys = await loadKeys();
  const index = keys.findIndex((k) => k.id === id);
  if (index === -1) return false;
  keys.splice(index, 1);
  await saveKeys(keys);
  return true;
}

export async function updateLastUsed(keyHash: string): Promise<void> {
  const keys = await loadKeys();
  const key = keys.find((k) => k.keyHash === keyHash);
  if (key) {
    key.lastUsedAt = Date.now();
    await saveKeys(keys);
  }
}

export async function findKeyByHash(keyHash: string): Promise<WebhookApiKey | undefined> {
  const keys = await loadKeys();
  return keys.find((k) => k.keyHash === keyHash);
}
