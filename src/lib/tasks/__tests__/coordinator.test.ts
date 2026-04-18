import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tasks/storage', () => ({
  readTask: vi.fn(),
  updateTask: vi.fn(),
}));

import { readTask, updateTask } from '@/lib/tasks/storage';

const mockReadTask = vi.mocked(readTask);
const mockUpdateTask = vi.mocked(updateTask);

import type {
  TaskRecord,
  TaskItem,
  TaskItemStatus,
  WorkerResult,
} from '@/types/task';

import {
  pickNextTask,
  computeProgress,
  shouldReplan,
  isIdle,
  isCompleted,
  assignTask,
  integrateWorkerResult,
} from '../coordinator';

function buildItem(id: string, overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    epicId: 'epic_1',
    title: id,
    description: '',
    status: 'todo',
    priority: 'medium',
    size: 'M',
    dependsOn: [],
    definitionOfDone: [],
    subtasks: [],
    ...overrides,
  };
}

function buildTask(items: TaskItem[], overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task_1',
    title: 'T',
    goal: 'G',
    mode: 'task',
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    acceptanceCriteria: [],
    epics: [{ id: 'epic_1', title: 'E', description: '', status: 'todo', taskIds: items.map((i) => i.id) }],
    tasks: items,
    decisions: [],
    changedFiles: [],
    openQuestions: [],
    ...overrides,
  };
}

describe('coordinator / pickNextTask', () => {
  it('todo + 의존성 충족 항목을 priority 오름차순으로 선택한다', () => {
    const items: TaskItem[] = [
      buildItem('a', { priority: 'low' }),
      buildItem('b', { priority: 'high' }),
      buildItem('c', { priority: 'medium' }),
    ];
    const next = pickNextTask(buildTask(items));
    expect(next?.id).toBe('b');
  });

  it('dependsOn이 done이 아닌 Task는 제외한다', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'in_progress' }),
      buildItem('b', { dependsOn: ['a'] }),
    ];
    expect(pickNextTask(buildTask(items))).toBeNull();
  });

  it('dependsOn이 모두 done이면 선택 가능하다', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { dependsOn: ['a'] }),
    ];
    expect(pickNextTask(buildTask(items))?.id).toBe('b');
  });

  it('같은 priority면 id 오름차순으로 안정 선택', () => {
    const items: TaskItem[] = [
      buildItem('z', { priority: 'high' }),
      buildItem('a', { priority: 'high' }),
    ];
    expect(pickNextTask(buildTask(items))?.id).toBe('a');
  });

  it('todo가 없으면 null', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'in_progress' }),
    ];
    expect(pickNextTask(buildTask(items))).toBeNull();
  });
});

describe('coordinator / computeProgress', () => {
  it('상태 분포와 percent를 계산한다', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'done' }),
      buildItem('c', { status: 'in_progress' }),
      buildItem('d', { status: 'todo' }),
    ];
    const p = computeProgress(buildTask(items));
    expect(p.total).toBe(4);
    expect(p.done).toBe(2);
    expect(p.inProgress).toBe(1);
    expect(p.todo).toBe(1);
    expect(p.percent).toBe(50);
  });

  it('dropped는 percent 분모에서 제외한다', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'dropped' }),
    ];
    const p = computeProgress(buildTask(items));
    expect(p.total).toBe(2);
    expect(p.dropped).toBe(1);
    expect(p.percent).toBe(100);
  });

  it('항목이 없으면 percent는 0', () => {
    const p = computeProgress(buildTask([]));
    expect(p.percent).toBe(0);
    expect(p.total).toBe(0);
  });
});

describe('coordinator / shouldReplan', () => {
  it('blocked 비율 30% 이상이면 true', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'blocked' }),
      buildItem('b', { status: 'blocked' }),
      buildItem('c', { status: 'todo' }),
      buildItem('d', { status: 'todo' }),
      buildItem('e', { status: 'todo' }),
    ];
    expect(shouldReplan(buildTask(items))).toBe(true);
  });

  it('openQuestions 6개 이상이면 true', () => {
    const items: TaskItem[] = [buildItem('a')];
    const task = buildTask(items, {
      openQuestions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
    });
    expect(shouldReplan(task)).toBe(true);
  });

  it('모두 todo면 false', () => {
    const items: TaskItem[] = [buildItem('a'), buildItem('b')];
    expect(shouldReplan(buildTask(items))).toBe(false);
  });
});

describe('coordinator / isIdle / isCompleted', () => {
  it('in_progress가 있으면 idle 아님', () => {
    const items: TaskItem[] = [buildItem('a', { status: 'in_progress' })];
    expect(isIdle(buildTask(items))).toBe(false);
  });

  it('todo가 있지만 dependsOn이 막혔으면 idle', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'blocked' }),
      buildItem('b', { dependsOn: ['a'] }),
    ];
    expect(isIdle(buildTask(items))).toBe(true);
  });

  it('모두 done/dropped면 completed', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'dropped' }),
    ];
    expect(isCompleted(buildTask(items))).toBe(true);
  });

  it('빈 Task는 completed 아님', () => {
    expect(isCompleted(buildTask([]))).toBe(false);
  });
});

describe('coordinator / assignTask', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockUpdateTask.mockReset();
  });

  it('todo 상태의 TaskItem을 in_progress + owner로 전이한다', async () => {
    const items: TaskItem[] = [buildItem('a')];
    const record = buildTask(items);
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    const result = await assignTask('task_1', 'a', 'coder');
    expect(result.status).toBe('in_progress');
    expect(result.owner).toBe('coder');
    expect(captured!.tasks[0].status).toBe('in_progress');
    expect(captured!.tasks[0].owner).toBe('coder');
  });

  it('todo가 아닌 Task를 할당하면 throw', async () => {
    const items: TaskItem[] = [buildItem('a', { status: 'in_progress' })];
    const record = buildTask(items);
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      return await updater(record);
    });
    await expect(assignTask('task_1', 'a', 'coder')).rejects.toThrow(/todo 상태가 아닙니다/);
  });
});

describe('coordinator / integrateWorkerResult', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockUpdateTask.mockReset();
  });

  it('completed 결과는 status=done, subtasks 체크, 파일 병합', async () => {
    const items: TaskItem[] = [
      buildItem('a', {
        status: 'in_progress',
        subtasks: [
          { id: 'st1', text: 's1', checked: false },
          { id: 'st2', text: 's2', checked: false },
        ],
      }),
    ];
    const record = buildTask(items, { changedFiles: ['old.ts'] });
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    const result: WorkerResult = {
      taskId: 'a',
      status: 'completed',
      summary: '구현 완료',
      completedSubtaskIds: ['st1'],
      changedFiles: ['new.ts'],
      followupSuggestions: ['후속 질문 1'],
    };
    await integrateWorkerResult('task_1', 'a', result);

    const updated = captured!.tasks[0];
    expect(updated.status).toBe<TaskItemStatus>('done');
    expect(updated.resultSummary).toBe('구현 완료');
    expect(updated.subtasks[0].checked).toBe(true);
    expect(updated.subtasks[1].checked).toBe(false);
    expect(captured!.changedFiles).toEqual(expect.arrayContaining(['old.ts', 'new.ts']));
    expect(captured!.openQuestions).toContain('후속 질문 1');
  });

  it('blocked 결과는 blocker와 함께 status=blocked', async () => {
    const items: TaskItem[] = [buildItem('a', { status: 'in_progress' })];
    const record = buildTask(items);
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    await integrateWorkerResult('task_1', 'a', {
      taskId: 'a',
      status: 'blocked',
      summary: 'API 문서 부족',
      completedSubtaskIds: [],
      changedFiles: [],
      blocker: '외부 API 스펙 누락',
    });
    expect(captured!.tasks[0].status).toBe('blocked');
    expect(captured!.tasks[0].blocker).toBe('외부 API 스펙 누락');
  });

  it('Epic의 모든 Task가 done이면 Epic status도 done', async () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'in_progress' }),
    ];
    const record = buildTask(items);
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });
    await integrateWorkerResult('task_1', 'b', {
      taskId: 'b',
      status: 'completed',
      summary: '',
      completedSubtaskIds: [],
      changedFiles: [],
    });
    expect(captured!.epics[0].status).toBe('done');
  });

  it('failed 결과는 blocked 상태로 매핑된다', async () => {
    const items: TaskItem[] = [buildItem('a', { status: 'in_progress' })];
    const record = buildTask(items);
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    await integrateWorkerResult('task_1', 'a', {
      taskId: 'a',
      status: 'failed',
      summary: '테스트 실패',
      completedSubtaskIds: [],
      changedFiles: [],
      blocker: '테스트 실행 불가',
    });

    expect(captured!.tasks[0].status).toBe('blocked');
    expect(captured!.tasks[0].blocker).toBe('테스트 실행 불가');
    expect(captured!.tasks[0].resultSummary).toBe('테스트 실패');
  });

  it('중복된 changedFiles는 union되어 중복 없이 병합된다', async () => {
    const items: TaskItem[] = [buildItem('a', { status: 'in_progress' })];
    const record = buildTask(items, { changedFiles: ['src/a.ts', 'src/b.ts'] });
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    await integrateWorkerResult('task_1', 'a', {
      taskId: 'a',
      status: 'completed',
      summary: '',
      completedSubtaskIds: [],
      changedFiles: ['src/b.ts', 'src/c.ts'], // b.ts 중복
    });

    expect(captured!.changedFiles).toEqual(
      expect.arrayContaining(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    );
    expect(captured!.changedFiles).toHaveLength(3);
  });

  it('존재하지 않는 itemId이면 throw', async () => {
    const items: TaskItem[] = [buildItem('a')];
    const record = buildTask(items);
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      return await updater(record);
    });

    await expect(
      integrateWorkerResult('task_1', 'nonexistent', {
        taskId: 'nonexistent',
        status: 'completed',
        summary: '',
        completedSubtaskIds: [],
        changedFiles: [],
      })
    ).rejects.toThrow(/찾을 수 없/);
  });

  it('Epic에 일부만 in_progress여도 Epic은 in_progress로 갱신된다', async () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'todo' }),
      buildItem('b', { status: 'todo' }),
    ];
    const record = buildTask(items);
    let captured: TaskRecord | null = null;
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      const next = await updater(record);
      captured = next;
      return next;
    });

    await integrateWorkerResult('task_1', 'a', {
      taskId: 'a',
      status: 'completed',
      summary: '',
      completedSubtaskIds: [],
      changedFiles: [],
    });

    expect(captured!.epics[0].status).toBe('in_progress');
  });
});

describe('coordinator / assignTask 에지 케이스', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockUpdateTask.mockReset();
  });

  it('존재하지 않는 itemId이면 throw', async () => {
    const record = buildTask([buildItem('a')]);
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      return await updater(record);
    });
    await expect(assignTask('task_1', 'nonexistent', 'coder')).rejects.toThrow(/찾을 수 없/);
  });

  it('blocked 상태 Task는 할당 불가', async () => {
    const record = buildTask([buildItem('a', { status: 'blocked' })]);
    mockUpdateTask.mockImplementation(async (_id, updater) => {
      return await updater(record);
    });
    await expect(assignTask('task_1', 'a', 'coder')).rejects.toThrow(/todo 상태가 아닙니다/);
  });
});

describe('coordinator / getCoordinatorState', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockUpdateTask.mockReset();
  });

  it('task가 없으면 null을 반환한다', async () => {
    mockReadTask.mockResolvedValueOnce(null);
    const { getCoordinatorState } = await import('../coordinator');
    const result = await getCoordinatorState('missing');
    expect(result).toBeNull();
  });

  it('존재하는 task의 종합 상태를 반환한다', async () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'todo' }),
    ];
    const record = buildTask(items);
    mockReadTask.mockResolvedValueOnce(record);

    const { getCoordinatorState } = await import('../coordinator');
    const result = await getCoordinatorState('task_1');

    expect(result).not.toBeNull();
    expect(result!.task).toEqual(record);
    expect(result!.next?.id).toBe('b');
    expect(result!.progress.total).toBe(2);
    expect(result!.progress.done).toBe(1);
    expect(result!.completed).toBe(false);
  });

  it('모두 done인 task는 completed:true, next:null을 반환한다', async () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'done' }),
      buildItem('b', { status: 'done' }),
    ];
    const record = buildTask(items);
    mockReadTask.mockResolvedValueOnce(record);

    const { getCoordinatorState } = await import('../coordinator');
    const result = await getCoordinatorState('task_1');

    expect(result!.completed).toBe(true);
    expect(result!.next).toBeNull();
    expect(result!.progress.percent).toBe(100);
  });
});

describe('coordinator / shouldReplan 추가', () => {
  it('todo/in_progress가 0이고 done < 전체-dropped면 stuck으로 true', () => {
    const items: TaskItem[] = [
      buildItem('a', { status: 'blocked' }),
      buildItem('b', { status: 'blocked' }),
    ];
    expect(shouldReplan(buildTask(items))).toBe(true);
  });

  it('빈 Task는 shouldReplan이 false', () => {
    expect(shouldReplan(buildTask([]))).toBe(false);
  });
});
