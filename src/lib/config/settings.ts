import { Settings } from '@/types/settings';
import { DEFAULT_SETTINGS, DATA_DIR } from './constants';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export async function loadSettings(): Promise<Settings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const saved = JSON.parse(data) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const merged = { ...current, ...settings };
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
