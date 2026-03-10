import { Settings } from '@/types/settings';
import { DEFAULT_SETTINGS, DATA_DIR } from './constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import path from 'path';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export async function loadSettings(): Promise<Settings> {
  const saved = await safeReadJSON<Partial<Settings>>(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  return withFileLock(SETTINGS_FILE, async () => {
    const current = await loadSettings();
    const merged = { ...current, ...settings };
    await atomicWriteJSON(SETTINGS_FILE, merged);
    return merged;
  });
}
