import type {
  TaskRecord,
  TaskItem,
  TaskItemStatus,
  TaskWorkerRole,
  WorkerResult,
} from '@/types/task';
import { readTask, updateTask } from './storage';

// ---------- 순수 함수 ----------

const PRIORITY_ORDER: Record<TaskItem['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * 실행 가능한 다음 TaskItem을 선택한다.
 * 조건: status === 'todo' && 모든 dependsOn이 'done' 상태
 * 정렬: priority 오름차순 → id 오름차순 (안정적 선택)
 */
export function pickNextTask(task: TaskRecord): TaskItem | null {
  const byId = new Map(task.tasks.map((t) => [t.id, t] as const));
  const candidates = task.tasks.filter((t) => {
    if (t.status !== 'todo') return false;
    return t.dependsOn.every((depId) => byId.get(depId)?.status === 'done');
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });
  return candidates[0];
}

export interface TaskProgress {
  total: number;
  done: number;
  blocked: number;
  inProgress: number;
  todo: number;
  dropped: number;
  percent: number;
}

/** TaskItem 상태 분포와 완료율을 계산한다. dropped는 percent 분모에서 제외한다. */
export function computeProgress(task: TaskRecord): TaskProgress {
  const counts: Record<TaskItemStatus, number> = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    dropped: 0,
  };
  for (const item of task.tasks) {
    counts[item.status]++;
  }
  const total = task.tasks.length;
  const effectiveTotal = total - counts.dropped;
  const percent = effectiveTotal > 0
    ? Math.round((counts.done / effectiveTotal) * 100)
    : 0;
  return {
    total,
    done: counts.done,
    blocked: counts.blocked,
    inProgress: counts.in_progress,
    todo: counts.todo,
    dropped: counts.dropped,
    percent,
  };
}

/**
 * Replan이 필요한지 판단한다.
 * - 전체 Task 중 blocked 비율이 30% 이상이거나
 * - openQuestions가 5개 초과이거나
 * - 진행 가능한 Task가 없는데 완료되지도 않음
 */
export function shouldReplan(task: TaskRecord): boolean {
  const progress = computeProgress(task);
  if (progress.total === 0) return false;

  const blockedRatio = progress.blocked / Math.max(progress.total - progress.dropped, 1);
  if (blockedRatio >= 0.3) return true;

  if (task.openQuestions.length > 5) return true;

  const stuck = progress.todo === 0 && progress.inProgress === 0 && progress.done < progress.total - progress.dropped;
  if (stuck) return true;

  return false;
}

/** Worker에게 할당 가능한 Task가 하나도 없고 in_progress도 없으면 idle 상태. */
export function isIdle(task: TaskRecord): boolean {
  const progress = computeProgress(task);
  if (progress.inProgress > 0) return false;
  return pickNextTask(task) === null;
}

/** TaskRecord 전체가 종료되었는지 (done 또는 dropped) */
export function isCompleted(task: TaskRecord): boolean {
  if (task.tasks.length === 0) return false;
  return task.tasks.every((t) => t.status === 'done' || t.status === 'dropped');
}

// ---------- storage 의존 함수 ----------

/**
 * 선택된 TaskItem을 in_progress 상태로 전이하고 owner를 부여한다.
 * updateTask는 withFileLock 내에서 RMW를 보장한다.
 */
export async function assignTask(
  taskId: string,
  itemId: string,
  owner: TaskWorkerRole,
): Promise<TaskItem> {
  let assigned: TaskItem | null = null;
  await updateTask(taskId, (record) => {
    const idx = record.tasks.findIndex((t) => t.id === itemId);
    if (idx < 0) {
      throw new Error(`TaskItem을 찾을 수 없습니다: ${itemId}`);
    }
    const item = record.tasks[idx];
    if (item.status !== 'todo') {
      throw new Error(`TaskItem이 todo 상태가 아닙니다: ${itemId} (현재: ${item.status})`);
    }
    const updated: TaskItem = { ...item, status: 'in_progress', owner };
    const tasks = [...record.tasks];
    tasks[idx] = updated;
    assigned = updated;
    return { ...record, tasks };
  });
  if (!assigned) {
    throw new Error(`assignTask 실패: ${itemId}`);
  }
  return assigned;
}

/**
 * Worker 결과를 TaskRecord에 통합한다.
 * - TaskItem.status 갱신 (completed → done / blocked → blocked / failed → blocked)
 * - resultSummary, blocker 기록
 * - subtasks의 completedSubtaskIds를 checked: true로 반영
 * - changedFiles는 기존 목록과 union
 * - followupSuggestions는 openQuestions로 병합
 */
export async function integrateWorkerResult(
  taskId: string,
  itemId: string,
  result: WorkerResult,
): Promise<void> {
  await updateTask(taskId, (record) => {
    const idx = record.tasks.findIndex((t) => t.id === itemId);
    if (idx < 0) {
      throw new Error(`TaskItem을 찾을 수 없습니다: ${itemId}`);
    }
    const item = record.tasks[idx];

    const nextStatus: TaskItemStatus =
      result.status === 'completed' ? 'done'
      : result.status === 'blocked' ? 'blocked'
      : 'blocked';

    const completedSet = new Set(result.completedSubtaskIds);
    const subtasks = item.subtasks.map((st) =>
      completedSet.has(st.id) ? { ...st, checked: true } : st,
    );

    const updatedItem: TaskItem = {
      ...item,
      status: nextStatus,
      subtasks,
      resultSummary: result.summary,
      blocker: result.blocker,
    };
    const tasks = [...record.tasks];
    tasks[idx] = updatedItem;

    const mergedFiles = Array.from(
      new Set([...record.changedFiles, ...result.changedFiles]),
    );
    const mergedQuestions = Array.from(
      new Set([...record.openQuestions, ...(result.followupSuggestions ?? [])]),
    );

    // 연관 Epic 상태 재계산: 모든 TaskItem이 done/dropped면 epic.status = 'done'
    const epics = record.epics.map((epic) => {
      if (!epic.taskIds.includes(itemId)) return epic;
      const epicTasks = tasks.filter((t) => epic.taskIds.includes(t.id));
      if (epicTasks.length === 0) return epic;
      const allFinished = epicTasks.every(
        (t) => t.status === 'done' || t.status === 'dropped',
      );
      const anyProgress = epicTasks.some(
        (t) => t.status === 'in_progress' || t.status === 'done',
      );
      let nextEpicStatus = epic.status;
      if (allFinished) nextEpicStatus = 'done';
      else if (anyProgress) nextEpicStatus = 'in_progress';
      return { ...epic, status: nextEpicStatus };
    });

    return {
      ...record,
      tasks,
      epics,
      changedFiles: mergedFiles,
      openQuestions: mergedQuestions,
    };
  });
}

/**
 * Coordinator 요약 상태를 반환한다. API 응답용.
 */
export async function getCoordinatorState(taskId: string): Promise<{
  task: TaskRecord;
  next: TaskItem | null;
  progress: TaskProgress;
  idle: boolean;
  completed: boolean;
  needsReplan: boolean;
} | null> {
  const task = await readTask(taskId);
  if (!task) return null;
  return {
    task,
    next: pickNextTask(task),
    progress: computeProgress(task),
    idle: isIdle(task),
    completed: isCompleted(task),
    needsReplan: shouldReplan(task),
  };
}
