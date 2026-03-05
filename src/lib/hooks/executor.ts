import {
  HookTrigger,
  EventHook,
  HookExecutionResult,
  HookFilter,
  WebhookActionConfig,
  LogActionConfig,
  MemorySaveActionConfig,
} from '@/types/hooks';
import { getHooksByTrigger, updateHook } from './storage';
import { appendHookLog } from './log';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';

function matchesFilters(hook: EventHook, eventData: Record<string, unknown>): boolean {
  if (!hook.filters || hook.filters.length === 0) return true;
  return hook.filters.every((filter: HookFilter) => {
    const val = String(eventData[filter.field] ?? '');
    switch (filter.operator) {
      case 'equals':
        return val === filter.value;
      case 'contains':
        return val.includes(filter.value);
      case 'not_equals':
        return val !== filter.value;
      default:
        return false;
    }
  });
}

async function executeWebhook(config: WebhookActionConfig, eventData: Record<string, unknown>): Promise<void> {
  const method = config.method || 'POST';
  await fetch(config.url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(eventData),
    signal: AbortSignal.timeout(5000),
  });
}

function sanitizeLogPath(filePath: string): string {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const basename = path.basename(normalized);
  const dir = path.dirname(normalized);
  const safeParts = dir.split(path.sep).filter(p => p !== '..' && p !== '.');
  return path.join(...safeParts, basename);
}

async function executeLog(config: LogActionConfig, eventData: Record<string, unknown>): Promise<void> {
  const safePath = sanitizeLogPath(config.filePath);
  const logFile = path.join(DATA_DIR, 'logs', safePath);
  await fs.mkdir(path.dirname(logFile), { recursive: true });

  const format = config.format || 'json';
  let entry: string;
  if (format === 'json') {
    entry = JSON.stringify({ timestamp: new Date().toISOString(), ...eventData }) + '\n';
  } else {
    entry = `[${new Date().toISOString()}] ${JSON.stringify(eventData)}\n`;
  }
  await fs.appendFile(logFile, entry, 'utf-8');
}

async function executeMemorySave(config: MemorySaveActionConfig, eventData: Record<string, unknown>): Promise<void> {
  const { MemoryManager } = await import('@/lib/memory/memory-manager');
  const { loadSettings } = await import('@/lib/config/settings');
  const settings = await loadSettings();
  const mm = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
  const summary = Object.entries(eventData)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v)}`)
    .join('\n')
    .slice(0, 500);
  const metadata: Record<string, unknown> = { type: 'hook', ...config.metadataTemplate };
  await mm.saveMemory(summary, metadata);
}

export class HookExecutor {
  static fireAndForget(trigger: HookTrigger, eventData: Record<string, unknown>): void {
    getHooksByTrigger(trigger)
      .then(hooks => {
        for (const hook of hooks) {
          if (matchesFilters(hook, eventData)) {
            HookExecutor.executeHook(hook, eventData).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }

  static async executeHook(hook: EventHook, eventData: Record<string, unknown>): Promise<HookExecutionResult> {
    const start = Date.now();
    try {
      switch (hook.action) {
        case 'webhook':
          await executeWebhook(hook.actionConfig as WebhookActionConfig, eventData);
          break;
        case 'log':
          await executeLog(hook.actionConfig as LogActionConfig, eventData);
          break;
        case 'memory_save':
          await executeMemorySave(hook.actionConfig as MemorySaveActionConfig, eventData);
          break;
      }
      const result: HookExecutionResult = {
        hookId: hook.id,
        success: true,
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
      updateHook(hook.id, { lastTriggeredAt: Date.now(), triggerCount: hook.triggerCount + 1 }).catch(() => {});
      appendHookLog(result).catch(() => {});
      return result;
    } catch (err) {
      const result: HookExecutionResult = {
        hookId: hook.id,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown',
        duration: Date.now() - start,
        timestamp: Date.now(),
      };
      appendHookLog(result).catch(() => {});
      return result;
    }
  }
}
