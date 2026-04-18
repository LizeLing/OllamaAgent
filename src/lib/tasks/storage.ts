import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';
import type {
  TaskRecord,
  TaskRecordMeta,
  TaskRun,
  TaskCheckpoint,
} from '@/types/task';

const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const INDEX_FILE = path.join(TASKS_DIR, 'index.json');

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface TaskCheckpointSummary {
  id: string;
  taskId: string;
  createdAt: number;
  summary: string;
  runId?: string;
  markdownPath: string;
}

function validateId(id: string, label = 'ID'): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`잘못된 ${label}: ${id}`);
  }
}

function taskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId);
}

function taskFile(taskId: string): string {
  return path.join(taskDir(taskId), 'task.json');
}

function runFile(taskId: string, runId: string): string {
  return path.join(taskDir(taskId), 'runs', `${runId}.json`);
}

function checkpointFile(taskId: string, checkpointId: string): string {
  return path.join(taskDir(taskId), 'checkpoints', `${checkpointId}.json`);
}

function toMeta(task: TaskRecord): TaskRecordMeta {
  const completed = task.tasks.filter((t) => t.status === 'done').length;
  return {
    id: task.id,
    title: task.title,
    goal: task.goal,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    epicCount: task.epics.length,
    taskCount: task.tasks.length,
    completedTaskCount: completed,
    ...(task.latestCheckpointId !== undefined && {
      latestCheckpointId: task.latestCheckpointId,
    }),
    ...(task.activeRunId !== undefined && { activeRunId: task.activeRunId }),
  };
}

async function readIndex(): Promise<TaskRecordMeta[]> {
  return safeReadJSON<TaskRecordMeta[]>(INDEX_FILE, []);
}

async function writeIndex(index: TaskRecordMeta[]): Promise<void> {
  await atomicWriteJSON(INDEX_FILE, index);
}

async function upsertIndexMeta(task: TaskRecord): Promise<void> {
  const index = await readIndex();
  const meta = toMeta(task);
  const existing = index.findIndex((m) => m.id === task.id);
  if (existing >= 0) {
    index[existing] = meta;
  } else {
    index.push(meta);
  }
  await writeIndex(index);
}

async function removeIndexMeta(taskId: string): Promise<void> {
  const index = await readIndex();
  const filtered = index.filter((m) => m.id !== taskId);
  if (filtered.length !== index.length) {
    await writeIndex(filtered);
  }
}

export async function listTasks(): Promise<TaskRecordMeta[]> {
  const index = await readIndex();
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readTask(taskId: string): Promise<TaskRecord | null> {
  try {
    validateId(taskId, 'taskId');
    const data = await fs.readFile(taskFile(taskId), 'utf-8');
    return JSON.parse(data) as TaskRecord;
  } catch {
    return null;
  }
}

export async function createTask(record: TaskRecord): Promise<void> {
  validateId(record.id, 'taskId');

  return withFileLock(INDEX_FILE, async () => {
    const existing = await safeReadJSON<TaskRecord | null>(taskFile(record.id), null);
    if (existing) {
      throw new Error(`이미 존재하는 Task: ${record.id}`);
    }
    await atomicWriteJSON(taskFile(record.id), record);
    await upsertIndexMeta(record);
  });
}

export async function updateTask(
  taskId: string,
  updater: (task: TaskRecord) => TaskRecord | Promise<TaskRecord>
): Promise<TaskRecord> {
  validateId(taskId, 'taskId');

  return withFileLock(taskFile(taskId), async () => {
    const current = await readTask(taskId);
    if (!current) {
      throw new Error(`Task를 찾을 수 없습니다: ${taskId}`);
    }

    const next = await updater(current);
    if (next.id !== taskId) {
      throw new Error(`Task ID 변경은 허용되지 않습니다: ${taskId} -> ${next.id}`);
    }

    const updated: TaskRecord = {
      ...next,
      updatedAt: Date.now(),
    };

    await atomicWriteJSON(taskFile(taskId), updated);
    await withFileLock(INDEX_FILE, () => upsertIndexMeta(updated));

    return updated;
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  validateId(taskId, 'taskId');

  return withFileLock(INDEX_FILE, async () => {
    try {
      await fs.rm(taskDir(taskId), { recursive: true, force: true });
    } catch (err) {
      logger.warn('TASKS', `Task 디렉토리 삭제 실패: ${taskId}`, err);
    }
    await removeIndexMeta(taskId);
  });
}

export async function saveRun(taskId: string, run: TaskRun): Promise<void> {
  validateId(taskId, 'taskId');
  validateId(run.id, 'runId');

  if (run.taskId !== taskId) {
    throw new Error(`TaskRun.taskId(${run.taskId})가 taskId(${taskId})와 일치하지 않습니다.`);
  }

  const filePath = runFile(taskId, run.id);
  return withFileLock(filePath, async () => {
    await atomicWriteJSON(filePath, run);
  });
}

export async function readRun(
  taskId: string,
  runId: string
): Promise<TaskRun | null> {
  try {
    validateId(taskId, 'taskId');
    validateId(runId, 'runId');
    const data = await fs.readFile(runFile(taskId, runId), 'utf-8');
    return JSON.parse(data) as TaskRun;
  } catch {
    return null;
  }
}

export async function listRuns(taskId: string): Promise<TaskRun[]> {
  try {
    validateId(taskId, 'taskId');
    const dir = path.join(taskDir(taskId), 'runs');
    const entries = await fs.readdir(dir);
    const runs: TaskRun[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const data = await safeReadJSON<TaskRun | null>(path.join(dir, name), null);
      if (data) runs.push(data);
    }
    return runs.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

export async function saveCheckpoint(
  taskId: string,
  cp: TaskCheckpoint
): Promise<void> {
  validateId(taskId, 'taskId');
  validateId(cp.id, 'checkpointId');

  if (cp.taskId !== taskId) {
    throw new Error(
      `Checkpoint.taskId(${cp.taskId})가 taskId(${taskId})와 일치하지 않습니다.`
    );
  }

  const filePath = checkpointFile(taskId, cp.id);
  return withFileLock(filePath, async () => {
    await atomicWriteJSON(filePath, cp);
  });
}

export async function readCheckpoint(
  taskId: string,
  checkpointId: string
): Promise<TaskCheckpoint | null> {
  try {
    validateId(taskId, 'taskId');
    validateId(checkpointId, 'checkpointId');
    const data = await fs.readFile(checkpointFile(taskId, checkpointId), 'utf-8');
    return JSON.parse(data) as TaskCheckpoint;
  } catch {
    return null;
  }
}

export async function listCheckpoints(
  taskId: string
): Promise<TaskCheckpointSummary[]> {
  try {
    validateId(taskId, 'taskId');
    const dir = path.join(taskDir(taskId), 'checkpoints');
    const entries = await fs.readdir(dir);
    const summaries: TaskCheckpointSummary[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const cp = await safeReadJSON<TaskCheckpoint | null>(path.join(dir, name), null);
      if (!cp) continue;
      summaries.push({
        id: cp.id,
        taskId: cp.taskId,
        createdAt: cp.createdAt,
        summary: cp.summary,
        markdownPath: cp.markdownPath,
        ...(cp.runId !== undefined && { runId: cp.runId }),
      });
    }
    return summaries.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function ensureTaskDirectories(taskId: string): Promise<void> {
  validateId(taskId, 'taskId');
  const base = taskDir(taskId);
  await fs.mkdir(path.join(base, 'runs'), { recursive: true });
  await fs.mkdir(path.join(base, 'checkpoints'), { recursive: true });
  await fs.mkdir(path.join(base, 'artifacts'), { recursive: true });
}

export function getTaskDirectoryPath(taskId: string): string {
  validateId(taskId, 'taskId');
  return taskDir(taskId);
}

export function getTaskFilePath(taskId: string): string {
  validateId(taskId, 'taskId');
  return taskFile(taskId);
}

export function getTaskMarkdownPath(taskId: string): string {
  validateId(taskId, 'taskId');
  return path.join(taskDir(taskId), 'task.md');
}

export function getCheckpointMarkdownPath(
  taskId: string,
  checkpointId: string
): string {
  validateId(taskId, 'taskId');
  validateId(checkpointId, 'checkpointId');
  return path.join(taskDir(taskId), 'checkpoints', `${checkpointId}.md`);
}
