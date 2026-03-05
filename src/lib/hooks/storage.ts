import { DATA_DIR } from '@/lib/config/constants';
import { EventHook, HookTrigger } from '@/types/hooks';
import fs from 'fs/promises';
import path from 'path';

const HOOKS_FILE = path.join(DATA_DIR, 'hooks.json');
const MAX_HOOKS = 50;

export async function loadHooks(): Promise<EventHook[]> {
  try {
    const raw = await fs.readFile(HOOKS_FILE, 'utf-8');
    return JSON.parse(raw) as EventHook[];
  } catch {
    return [];
  }
}

export async function saveHooks(hooks: EventHook[]): Promise<void> {
  await fs.mkdir(path.dirname(HOOKS_FILE), { recursive: true });
  await fs.writeFile(HOOKS_FILE, JSON.stringify(hooks, null, 2), 'utf-8');
}

export async function addHook(hook: EventHook): Promise<void> {
  const hooks = await loadHooks();
  if (hooks.length >= MAX_HOOKS) {
    throw new Error(`최대 ${MAX_HOOKS}개의 훅만 등록할 수 있습니다.`);
  }
  hooks.push(hook);
  await saveHooks(hooks);
}

export async function updateHook(id: string, updates: Partial<EventHook>): Promise<EventHook | null> {
  const hooks = await loadHooks();
  const idx = hooks.findIndex(h => h.id === id);
  if (idx === -1) return null;
  hooks[idx] = { ...hooks[idx], ...updates, id };
  await saveHooks(hooks);
  return hooks[idx];
}

export async function removeHook(id: string): Promise<boolean> {
  const hooks = await loadHooks();
  const filtered = hooks.filter(h => h.id !== id);
  if (filtered.length === hooks.length) return false;
  await saveHooks(filtered);
  return true;
}

export async function getHooksByTrigger(trigger: HookTrigger): Promise<EventHook[]> {
  const hooks = await loadHooks();
  return hooks.filter(h => h.enabled && h.trigger === trigger);
}
