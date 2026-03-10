import { AgentPreset } from '@/types/settings';
import { DEFAULT_PRESETS } from './defaults';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';
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
      } catch (err) {
        logger.warn('PRESETS', `Failed to load preset: ${file}`, err);
      }
    }
    return presets;
  } catch (err) {
    logger.debug('PRESETS', 'Presets directory not accessible', err);
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
  } catch (err) {
    logger.debug('PRESETS', `Preset not found: ${id}`, err);
    return null;
  }
}

export async function savePreset(preset: AgentPreset): Promise<void> {
  await ensureDir();
  validateId(preset.id);
  await atomicWriteJSON(path.join(PRESETS_DIR, `${preset.id}.json`), preset);
}

export async function deletePreset(id: string): Promise<boolean> {
  if (DEFAULT_PRESETS.some((p) => p.id === id)) {
    return false; // cannot delete default presets
  }
  try {
    validateId(id);
    await fs.unlink(path.join(PRESETS_DIR, `${id}.json`));
    return true;
  } catch (err) {
    logger.warn('PRESETS', `Failed to delete preset: ${id}`, err);
    return false;
  }
}
