'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TaskRecordMeta } from '@/types/task';
import TaskStatusBadge from './TaskStatusBadge';

interface TaskListProps {
  activeTaskId?: string | null;
  onSelect?: (taskId: string) => void;
  /** 외부에서 새로고침을 트리거하고 싶을 때 증가시키는 토큰. */
  refreshToken?: number;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}일 전`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function progressRatio(meta: TaskRecordMeta): number {
  if (meta.taskCount === 0) return 0;
  return Math.min(1, meta.completedTaskCount / meta.taskCount);
}

export default function TaskList({ activeTaskId, onSelect, refreshToken = 0 }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskRecordMeta[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tasks', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const list = Array.isArray(data) ? (data as TaskRecordMeta[]) : [];
        if (controller.signal.aborted) return;
        setTasks(list);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Task 목록을 불러오지 못했습니다.');
        setStatus('error');
      });
    return () => controller.abort();
  }, [refreshToken]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect?.(id);
    },
    [onSelect],
  );

  if (status === 'loading' && tasks.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted">Task 목록을 불러오는 중...</div>
    );
  }

  if (status === 'error' && error) {
    return (
      <div className="px-3 py-4 text-xs text-error">{error}</div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-3 py-6 text-xs text-muted text-center">
        <p className="mb-2">등록된 Task가 없습니다.</p>
        <p className="text-[11px] leading-relaxed">
          <span className="font-mono text-foreground">/task new &lt;목표&gt;</span> 명령어로 새 Task를 시작할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {tasks.map((t) => {
        const ratio = progressRatio(t);
        const isActive = activeTaskId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSelect(t.id)}
            className={`group w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              isActive
                ? 'border-accent/60 bg-accent/10'
                : 'border-transparent bg-card hover:bg-card-hover'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{t.title || '(제목 없음)'}</span>
                  <TaskStatusBadge status={t.status} />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {t.goal || '목표가 설정되지 않았습니다.'}
                </p>
              </div>
              {t.latestCheckpointId && (
                <span
                  className="mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                  title="checkpoint 저장됨"
                  aria-label="checkpoint 존재"
                />
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] text-muted">
                {t.completedTaskCount}/{t.taskCount}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
              <span>{formatRelative(t.updatedAt)}</span>
              {t.activeRunId && <span className="text-accent">실행 중</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
