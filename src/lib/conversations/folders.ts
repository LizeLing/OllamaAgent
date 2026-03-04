import { FolderMeta } from '@/types/folder';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');

async function readFolders(): Promise<FolderMeta[]> {
  try {
    const data = await fs.readFile(FOLDERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeFolders(folders: FolderMeta[]): Promise<void> {
  await fs.mkdir(path.dirname(FOLDERS_FILE), { recursive: true });
  await fs.writeFile(FOLDERS_FILE, JSON.stringify(folders, null, 2));
}

export async function listFolders(): Promise<FolderMeta[]> {
  const folders = await readFolders();
  return folders.sort((a, b) => a.order - b.order);
}

export async function createFolder(name: string, color: string): Promise<FolderMeta> {
  const folders = await readFolders();
  const folder: FolderMeta = {
    id: `folder-${Date.now()}`,
    name,
    color,
    order: folders.length,
  };
  folders.push(folder);
  await writeFolders(folders);
  return folder;
}

export async function updateFolder(id: string, updates: Partial<FolderMeta>): Promise<FolderMeta | null> {
  const folders = await readFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  folders[idx] = { ...folders[idx], ...updates, id };
  await writeFolders(folders);
  return folders[idx];
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await readFolders();
  const filtered = folders.filter((f) => f.id !== id);
  await writeFolders(filtered);
}
