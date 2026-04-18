import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskList from '../TaskList';
import type { TaskRecordMeta } from '@/types/task';

function mockTasksFetch(meta: TaskRecordMeta[] | null, opts?: { ok?: boolean; status?: number }) {
  const ok = opts?.ok ?? true;
  return vi.fn().mockResolvedValue({
    ok,
    status: opts?.status ?? (ok ? 200 : 500),
    json: () => Promise.resolve(meta ?? []),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskList', () => {
  it('Task가 비어있으면 안내 메시지와 /task new 가이드를 렌더한다', async () => {
    global.fetch = mockTasksFetch([]);
    render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText('등록된 Task가 없습니다.')).toBeInTheDocument();
    });
    expect(screen.getByText(/\/task new/)).toBeInTheDocument();
  });

  it('Task 목록을 불러와 제목과 진행률을 렌더한다', async () => {
    const tasks: TaskRecordMeta[] = [
      {
        id: 'task_1',
        title: '첫 번째 Task',
        goal: '목표 A',
        status: 'active',
        createdAt: Date.now() - 60_000,
        updatedAt: Date.now() - 60_000,
        epicCount: 1,
        taskCount: 4,
        completedTaskCount: 1,
      },
      {
        id: 'task_2',
        title: '두 번째 Task',
        goal: '',
        status: 'done',
        createdAt: Date.now() - 3600_000,
        updatedAt: Date.now() - 3600_000,
        epicCount: 1,
        taskCount: 2,
        completedTaskCount: 2,
        latestCheckpointId: 'cp_x',
      },
    ];
    global.fetch = mockTasksFetch(tasks);

    render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText('첫 번째 Task')).toBeInTheDocument();
    });
    expect(screen.getByText('두 번째 Task')).toBeInTheDocument();
    // 진행률 텍스트 (completedTaskCount/taskCount)
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('fetch 실패 시 에러 메시지를 렌더한다', async () => {
    global.fetch = mockTasksFetch(null, { ok: false, status: 500 });
    render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    });
  });

  it('Task 항목 클릭 시 onSelect가 taskId로 호출된다', async () => {
    const tasks: TaskRecordMeta[] = [
      {
        id: 'task_xyz',
        title: '클릭 테스트',
        goal: '',
        status: 'active',
        createdAt: 0,
        updatedAt: 0,
        epicCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
      },
    ];
    global.fetch = mockTasksFetch(tasks);
    const onSelect = vi.fn();

    render(<TaskList onSelect={onSelect} />);

    const btn = await screen.findByText('클릭 테스트');
    await userEvent.click(btn);

    expect(onSelect).toHaveBeenCalledWith('task_xyz');
  });

  it('activeTaskId가 있으면 해당 항목에 active 스타일이 적용된다', async () => {
    const tasks: TaskRecordMeta[] = [
      {
        id: 'task_a',
        title: 'A Task',
        goal: '',
        status: 'active',
        createdAt: 0,
        updatedAt: 0,
        epicCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
      },
    ];
    global.fetch = mockTasksFetch(tasks);

    const { container } = render(<TaskList activeTaskId="task_a" />);
    await waitFor(() => {
      expect(screen.getByText('A Task')).toBeInTheDocument();
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toMatch(/bg-accent\/10/);
  });
});
