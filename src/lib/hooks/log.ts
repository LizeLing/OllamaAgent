import { HookExecutionResult } from '@/types/hooks';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(DATA_DIR, 'hook-logs.json');
const MAX_LOGS = 200;

export async function appendHookLog(result: HookExecutionResult): Promise<void> {
  let logs: HookExecutionResult[] = [];
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf-8');
    logs = JSON.parse(raw);
  } catch {
    // file doesn't exist yet
  }
  logs.push(result);
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
}

export async function getHookLogs(hookId?: string, limit?: number): Promise<HookExecutionResult[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf-8');
    let logs: HookExecutionResult[] = JSON.parse(raw);
    if (hookId) {
      logs = logs.filter(l => l.hookId === hookId);
    }
    if (limit && limit > 0) {
      logs = logs.slice(-limit);
    }
    return logs;
  } catch {
    return [];
  }
}

export async function clearHookLogs(): Promise<void> {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, '[]', 'utf-8');
}
