import { AgentPreset } from '@/types/settings';
import { DEFAULT_PRESETS } from './defaults';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const PRESETS_DIR = path.join(DATA_DIR, 'presets');

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID: ${id}`);
  }
}

async function ensureDir() {
  await fs.mkdir(PRESETS_DIR, { recursive: true });
}

async function loadCustomPresets(): Promise<AgentPreset[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(PRESETS_DIR);
    const presets: AgentPreset[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(PRESETS_DIR, file), 'utf-8');
        presets.push(JSON.parse(data));
      } catch {
        // Skip invalid preset file
      }
    }
    return presets;
  } catch {
    // Presets directory does not exist yet
    return [];
  }
}

export async function listPresets(): Promise<AgentPreset[]> {
  const custom = await loadCustomPresets();
  return [...DEFAULT_PRESETS, ...custom];
}

export async function getPreset(id: string): Promise<AgentPreset | null> {
  const defaultPreset = DEFAULT_PRESETS.find((p) => p.id === id);
  if (defaultPreset) return defaultPreset;

  try {
    validateId(id);
    const data = await fs.readFile(path.join(PRESETS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    // Preset file not found
    return null;
  }
}

export async function savePreset(preset: AgentPreset): Promise<void> {
  await ensureDir();
  validateId(preset.id);
  await fs.writeFile(path.join(PRESETS_DIR, `${preset.id}.json`), JSON.stringify(preset, null, 2));
}

export async function deletePreset(id: string): Promise<boolean> {
  if (DEFAULT_PRESETS.some((p) => p.id === id)) {
    return false; // cannot delete default presets
  }
  try {
    validateId(id);
    await fs.unlink(path.join(PRESETS_DIR, `${id}.json`));
    return true;
  } catch {
    // Preset file not found
    return false;
  }
}
