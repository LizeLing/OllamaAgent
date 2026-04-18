'use client';

import { TaskStatus, TaskItemStatus, TaskEpicStatus } from '@/types/task';

type AnyStatus = TaskStatus | TaskItemStatus | TaskEpicStatus;

const LABELS: Record<AnyStatus, string> = {
  active: '진행 중',
  blocked: '차단됨',
  review: '검토',
  done: '완료',
  archived: '보관됨',
  todo: '대기',
  in_progress: '진행 중',
  dropped: '취소',
};

const TONES: Record<AnyStatus, string> = {
  active: 'bg-accent/20 text-accent',
  in_progress: 'bg-accent/20 text-accent',
  blocked: 'bg-error/20 text-error',
  review: 'bg-amber-500/20 text-amber-500',
  done: 'bg-emerald-500/20 text-emerald-500',
  archived: 'bg-border/50 text-muted',
  todo: 'bg-border/50 text-muted',
  dropped: 'bg-border/50 text-muted',
};

interface TaskStatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

export default function TaskStatusBadge({ status, className = '' }: TaskStatusBadgeProps) {
  const label = LABELS[status] ?? String(status);
  const tone = TONES[status] ?? 'bg-border/50 text-muted';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
