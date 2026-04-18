import type {
  TaskCheckpoint,
  TaskItem,
  TaskRecord,
  TaskRun,
} from '@/types/task';
import {
  getCheckpointMarkdownPath,
  listCheckpoints as storageListCheckpoints,
  readCheckpoint as storageReadCheckpoint,
  readTask,
  saveCheckpoint,
  updateTask,
  type TaskCheckpointSummary,
} from './storage';
import { writeCheckpointMarkdown } from './markdown';

const CHECKPOINT_ID_PREFIX = 'cp_';

function generateCheckpointId(now: number = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${CHECKPOINT_ID_PREFIX}${now}_${rand}`;
}

function pickNextTaskHints(task: TaskRecord): string[] {
  const order: TaskItem['status'][] = ['in_progress', 'todo'];
  const ready: string[] = [];
  const doneIds = new Set(
    task.tasks.filter((t) => t.status === 'done').map((t) => t.id),
  );
  for (const status of order) {
    for (const item of task.tasks) {
      if (item.status !== status) continue;
      const blocked = item.dependsOn.some((id) => !doneIds.has(id));
      if (blocked) continue;
      ready.push(`${item.title} (\`${item.id}\`)`);
    }
  }
  return ready;
}

function collectBlockers(task: TaskRecord): string[] {
  return task.tasks
    .filter((t) => t.status === 'blocked' && t.blocker)
    .map((t) => `${t.title} (\`${t.id}\`): ${t.blocker}`);
}

function formatSummary(task: TaskRecord, run?: TaskRun): string {
  const total = task.tasks.length;
  const completed = task.tasks.filter((t) => t.status === 'done').length;
  const inProgress = task.tasks.filter((t) => t.status === 'in_progress').length;
  const blocked = task.tasks.filter((t) => t.status === 'blocked').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const latestDecision = task.decisions[task.decisions.length - 1]?.summary;
  const runTag = run ? ` [run:${run.id}]` : '';
  const decisionTag = latestDecision ? ` / 최근 결정: ${latestDecision}` : '';
  return `${task.title}: ${completed}/${total} 완료 (${pct}%) · 진행 ${inProgress} · 차단 ${blocked}${decisionTag}${runTag}`;
}

function buildResumePromptTemplate(task: TaskRecord, cp: Omit<TaskCheckpoint, 'resumePrompt' | 'markdownPath'>): string {
  const lines: string[] = [];
  lines.push(`# Task Resume: ${task.title}`);
  lines.push('');
  lines.push(`## 목표`);
  lines.push(task.goal || '(미정의)');
  lines.push('');

  if (task.acceptanceCriteria.length > 0) {
    lines.push('## 수용 조건');
    for (const ac of task.acceptanceCriteria) lines.push(`- ${ac}`);
    lines.push('');
  }

  lines.push('## 현재 진행 상태');
  lines.push(`- 완료: ${cp.completedTaskIds.length}개`);
  lines.push(`- 진행 중: ${cp.inProgressTaskIds.length}개`);
  lines.push(`- 차단됨: ${cp.blockedTaskIds.length}개`);
  lines.push('');

  if (cp.inProgressTaskIds.length > 0) {
    lines.push('## 진행 중 Task');
    for (const id of cp.inProgressTaskIds) lines.push(`- ${id}`);
    lines.push('');
  }

  if (cp.blockedTaskIds.length > 0) {
    lines.push('## 차단된 Task');
    for (const id of cp.blockedTaskIds) lines.push(`- ${id}`);
    lines.push('');
  }

  if (cp.decisions.length > 0) {
    lines.push('## 주요 결정');
    for (const d of cp.decisions) lines.push(`- ${d}`);
    lines.push('');
  }

  if (cp.changedFiles.length > 0) {
    lines.push('## 변경된 파일');
    for (const f of cp.changedFiles) lines.push(`- ${f}`);
    lines.push('');
  }

  if (cp.openQuestions.length > 0) {
    lines.push('## 미해결 질문');
    for (const q of cp.openQuestions) lines.push(`- ${q}`);
    lines.push('');
  }

  lines.push('## 다음 행동');
  if (cp.nextActions.length === 0) {
    lines.push('- (이어서 수행할 Task 없음 — 완료 여부를 확인하세요)');
  } else {
    for (const a of cp.nextActions) lines.push(`- ${a}`);
  }

  return lines.join('\n');
}

/**
 * TaskRecord + 선택적 TaskRun에서 순수 함수로 TaskCheckpoint를 만든다.
 * 외부 I/O 없이 결정적으로 계산되므로 단위 테스트 용이.
 */
export function buildCheckpoint(
  task: TaskRecord,
  run?: TaskRun,
  options: { id?: string; now?: number } = {},
): TaskCheckpoint {
  const now = options.now ?? Date.now();
  const id = options.id ?? generateCheckpointId(now);

  const completedTaskIds = task.tasks.filter((t) => t.status === 'done').map((t) => t.id);
  const inProgressTaskIds = task.tasks.filter((t) => t.status === 'in_progress').map((t) => t.id);
  const blockedTaskIds = task.tasks.filter((t) => t.status === 'blocked').map((t) => t.id);

  const nextActions: string[] = [];
  for (const hint of pickNextTaskHints(task)) nextActions.push(`다음 Task: ${hint}`);
  for (const blocker of collectBlockers(task)) nextActions.push(`차단 해소 필요: ${blocker}`);

  const decisions = task.decisions.map((d) => d.summary);
  const summary = formatSummary(task, run);

  const partial: Omit<TaskCheckpoint, 'resumePrompt' | 'markdownPath'> = {
    id,
    taskId: task.id,
    ...(run?.id !== undefined && { runId: run.id }),
    createdAt: now,
    summary,
    completedTaskIds,
    inProgressTaskIds,
    blockedTaskIds,
    changedFiles: [...task.changedFiles],
    decisions,
    openQuestions: [...task.openQuestions],
    nextActions,
  };

  const resumePrompt = buildResumePromptTemplate(task, partial);
  const markdownPath = getCheckpointMarkdownPath(task.id, id);

  return {
    ...partial,
    resumePrompt,
    markdownPath,
  };
}

/**
 * Checkpoint를 생성해 JSON/Markdown으로 저장하고 TaskRecord.latestCheckpointId를 갱신한다.
 * LLM 호출 없이 Task State에서만 조립하므로 저장 계층 외 I/O 없음.
 */
export async function createCheckpoint(
  taskId: string,
  run?: TaskRun,
  options: { id?: string; now?: number } = {},
): Promise<TaskCheckpoint> {
  const task = await readTask(taskId);
  if (!task) throw new Error(`Task를 찾을 수 없습니다: ${taskId}`);

  const checkpoint = buildCheckpoint(task, run, options);
  await saveCheckpoint(taskId, checkpoint);
  await writeCheckpointMarkdown(taskId, checkpoint);

  await updateTask(taskId, (current) => ({
    ...current,
    latestCheckpointId: checkpoint.id,
  }));

  return checkpoint;
}

export async function listCheckpoints(taskId: string): Promise<TaskCheckpointSummary[]> {
  return storageListCheckpoints(taskId);
}

export async function readCheckpoint(
  taskId: string,
  checkpointId: string,
): Promise<TaskCheckpoint | null> {
  return storageReadCheckpoint(taskId, checkpointId);
}
