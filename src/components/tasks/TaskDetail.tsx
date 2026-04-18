'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TaskRecord, TaskItem, TaskItemStatus } from '@/types/task';
import TaskStatusBadge from './TaskStatusBadge';

interface TaskCheckpointSummary {
  id: string;
  taskId: string;
  createdAt: number;
  summary: string;
  runId?: string;
  markdownPath: string;
}

interface TaskDetailProps {
  taskId: string;
  /** 외부에서 새로고침을 트리거할 때 증가시키는 토큰. */
  refreshToken?: number;
  /** checkpoint 생성 성공 시 호출 (목록 새로고침 등). */
  onCheckpointCreated?: (checkpointId: string) => void;
  /** Task 실행 요청(Main Agent 재개). 상위 hook/API 경로와 연결. */
  onExecute?: (taskId: string) => void;
}

const ITEM_STATUS_ORDER: TaskItemStatus[] = ['in_progress', 'blocked', 'todo', 'done', 'dropped'];

function groupByStatus(tasks: TaskItem[]): Record<TaskItemStatus, TaskItem[]> {
  const result: Record<TaskItemStatus, TaskItem[]> = {
    todo: [],
    in_progress: [],
    blocked: [],
    done: [],
    dropped: [],
  };
  for (const t of tasks) {
    result[t.status].push(t);
  }
  return result;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TaskDetail({
  taskId,
  refreshToken = 0,
  onCheckpointCreated,
  onExecute,
}: TaskDetailProps) {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [checkpoints, setCheckpoints] = useState<TaskCheckpointSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/tasks/${taskId}`, { signal: controller.signal }).then(async (r) => {
        if (!r.ok) throw new Error(`Task 조회 실패 (HTTP ${r.status})`);
        return (await r.json()) as TaskRecord;
      }),
      fetch(`/api/tasks/${taskId}/checkpoint`, { signal: controller.signal })
        .then(async (r) => (r.ok ? ((await r.json()) as { checkpoints: TaskCheckpointSummary[] }) : { checkpoints: [] }))
        .catch(() => ({ checkpoints: [] })),
    ])
      .then(([record, cpRes]) => {
        setTask(record);
        setCheckpoints(Array.isArray(cpRes.checkpoints) ? cpRes.checkpoints : []);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Task 상세를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [taskId, refreshToken]);

  const handleCreateCheckpoint = useCallback(async () => {
    if (!task || checkpointBusy) return;
    setCheckpointBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`checkpoint 생성 실패 (HTTP ${res.status})`);
      const cp = await res.json();
      if (cp?.id) {
        onCheckpointCreated?.(cp.id);
        // 낙관적 갱신: 새 checkpoint를 목록 최상단에 반영
        setCheckpoints((prev) => [
          {
            id: cp.id,
            taskId: task.id,
            createdAt: cp.createdAt ?? Date.now(),
            summary: cp.summary ?? '',
            runId: cp.runId,
            markdownPath: cp.markdownPath ?? '',
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'checkpoint 생성에 실패했습니다.');
    } finally {
      setCheckpointBusy(false);
    }
  }, [task, checkpointBusy, onCheckpointCreated]);

  if (loading && !task) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8 text-sm text-muted">
        Task 상세를 불러오는 중...
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8 text-sm text-error">
        {error || 'Task를 찾을 수 없습니다.'}
      </div>
    );
  }

  const grouped = groupByStatus(task.tasks);
  const latestCheckpoint = checkpoints[0];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6 md:py-8">
        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{task.title || '(제목 없음)'}</h2>
            <TaskStatusBadge status={task.status} />
            <span className="text-[11px] font-mono text-muted">{task.id}</span>
          </div>
          {task.goal && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {task.goal}
            </p>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {onExecute && (
            <button
              type="button"
              onClick={() => onExecute(task.id)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              Task 실행
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateCheckpoint}
            disabled={checkpointBusy}
            className="rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            {checkpointBusy ? 'checkpoint 생성 중...' : 'checkpoint 생성'}
          </button>
        </div>

        {/* 수용 조건 */}
        {task.acceptanceCriteria.length > 0 && (
          <Section title="수용 조건">
            <ul className="space-y-1 text-sm">
              {task.acceptanceCriteria.map((ac, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted">•</span>
                  <span className="text-foreground">{ac}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Epic */}
        {task.epics.length > 0 && (
          <Section title={`Epic (${task.epics.length})`}>
            <div className="space-y-2">
              {task.epics.map((epic) => (
                <div
                  key={epic.id}
                  className="rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted">{epic.id}</span>
                    <span className="text-sm font-medium text-foreground">{epic.title}</span>
                    <TaskStatusBadge status={epic.status} />
                    <span className="ml-auto text-[11px] text-muted">
                      {epic.taskIds.length}개 Task
                    </span>
                  </div>
                  {epic.description && (
                    <p className="mt-1 text-xs text-muted">{epic.description}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Task 목록 */}
        <Section title={`Task 목록 (${task.tasks.length})`}>
          {task.tasks.length === 0 ? (
            <p className="text-xs text-muted">분해된 Task가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {ITEM_STATUS_ORDER.map((status) => {
                const list = grouped[status];
                if (list.length === 0) return null;
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center gap-2">
                      <TaskStatusBadge status={status} />
                      <span className="text-[11px] text-muted">{list.length}개</span>
                    </div>
                    <ul className="space-y-1">
                      {list.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-md border border-border/60 bg-card/70 px-3 py-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted">{item.id}</span>
                            <span className="text-sm text-foreground">{item.title}</span>
                            <span className="ml-auto text-[10px] text-muted">
                              {item.priority}/{item.size}
                              {item.owner ? ` · ${item.owner}` : ''}
                            </span>
                          </div>
                          {item.blocker && (
                            <p className="mt-0.5 text-[11px] text-error">
                              blocker: {item.blocker}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Working Set */}
        {task.changedFiles.length > 0 && (
          <Section title={`Working Set (${task.changedFiles.length})`}>
            <ul className="space-y-0.5 text-xs font-mono text-foreground">
              {task.changedFiles.map((f) => (
                <li key={f} className="truncate">{f}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* 미해결 질문 */}
        {task.openQuestions.length > 0 && (
          <Section title={`미해결 질문 (${task.openQuestions.length})`}>
            <ul className="space-y-1 text-sm">
              {task.openQuestions.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-500">?</span>
                  <span className="text-foreground">{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 최신 checkpoint */}
        <Section title="최신 checkpoint">
          {latestCheckpoint ? (
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted">{latestCheckpoint.id}</span>
                <span className="text-[11px] text-muted">
                  {formatTimestamp(latestCheckpoint.createdAt)}
                </span>
              </div>
              {latestCheckpoint.summary && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {latestCheckpoint.summary}
                </p>
              )}
              {checkpoints.length > 1 && (
                <p className="mt-2 text-[11px] text-muted">
                  이전 checkpoint {checkpoints.length - 1}개 존재
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">아직 생성된 checkpoint가 없습니다.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
