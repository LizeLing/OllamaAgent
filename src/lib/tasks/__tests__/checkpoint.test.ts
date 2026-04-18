import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskRecord, TaskRun } from '@/types/task';

const mockReadTask = vi.fn();
const mockSaveCheckpoint = vi.fn().mockResolvedValue(undefined);
const mockUpdateTask = vi.fn();
const mockListCheckpoints = vi.fn();
const mockReadCheckpoint = vi.fn();
const mockWriteCheckpointMarkdown = vi.fn().mockResolvedValue('/tmp/cp.md');

vi.mock('../storage', () => ({
  readTask: (id: string) => mockReadTask(id),
  saveCheckpoint: (id: string, cp: unknown) => mockSaveCheckpoint(id, cp),
  updateTask: (id: string, updater: unknown) => mockUpdateTask(id, updater),
  listCheckpoints: (id: string) => mockListCheckpoints(id),
  readCheckpoint: (id: string, cpId: string) => mockReadCheckpoint(id, cpId),
  getCheckpointMarkdownPath: (taskId: string, cpId: string) =>
    `/tmp/tasks/${taskId}/checkpoints/${cpId}.md`,
}));

vi.mock('../markdown', () => ({
  writeCheckpointMarkdown: (id: string, cp: unknown) => mockWriteCheckpointMarkdown(id, cp),
}));

import { buildCheckpoint, createCheckpoint, listCheckpoints, readCheckpoint } from '../checkpoint';

function buildTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task_1',
    title: 'Sample Task',
    goal: '목표 설명',
    mode: 'task',
    status: 'active',
    createdAt: 100,
    updatedAt: 200,
    acceptanceCriteria: ['AC1'],
    epics: [],
    tasks: [],
    decisions: [],
    changedFiles: [],
    openQuestions: [],
    ...overrides,
  };
}

describe('buildCheckpoint (순수 함수)', () => {
  it('빈 Task에서 기본 checkpoint를 조립한다', () => {
    const task = buildTask();
    const cp = buildCheckpoint(task, undefined, { id: 'cp_fixed', now: 1000 });
    expect(cp.id).toBe('cp_fixed');
    expect(cp.taskId).toBe('task_1');
    expect(cp.createdAt).toBe(1000);
    expect(cp.completedTaskIds).toEqual([]);
    expect(cp.inProgressTaskIds).toEqual([]);
    expect(cp.blockedTaskIds).toEqual([]);
    expect(cp.decisions).toEqual([]);
    expect(cp.changedFiles).toEqual([]);
    expect(cp.nextActions).toEqual([]);
    expect(cp.markdownPath).toContain('cp_fixed.md');
    expect(cp.resumePrompt).toContain('Task Resume');
    expect(cp.resumePrompt).toContain('목표 설명');
    expect(cp.resumePrompt).toContain('AC1');
  });

  it('상태별 task ID를 정확히 집계한다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 't1', epicId: 'e1', title: 'T1', description: '', status: 'done',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
        {
          id: 't2', epicId: 'e1', title: 'T2', description: '', status: 'in_progress',
          priority: 'high', size: 'M', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
        {
          id: 't3', epicId: 'e1', title: 'T3', description: '', status: 'blocked',
          priority: 'low', size: 'L', dependsOn: [], definitionOfDone: [], subtasks: [],
          blocker: '외부 API 키 필요',
        },
        {
          id: 't4', epicId: 'e1', title: 'T4', description: '', status: 'todo',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_x', now: 5000 });
    expect(cp.completedTaskIds).toEqual(['t1']);
    expect(cp.inProgressTaskIds).toEqual(['t2']);
    expect(cp.blockedTaskIds).toEqual(['t3']);
  });

  it('의존성이 충족된 todo만 nextActions에 포함한다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 't1', epicId: 'e1', title: 'T1', description: '', status: 'done',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
        {
          id: 't2', epicId: 'e1', title: 'T2', description: '', status: 'todo',
          priority: 'high', size: 'S', dependsOn: ['t1'], definitionOfDone: [], subtasks: [],
        },
        {
          id: 't3', epicId: 'e1', title: 'T3', description: '', status: 'todo',
          priority: 'high', size: 'S', dependsOn: ['t99'], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_y', now: 5000 });
    expect(cp.nextActions.some((a) => a.includes('T2'))).toBe(true);
    expect(cp.nextActions.some((a) => a.includes('T3'))).toBe(false);
  });

  it('blocked task의 blocker를 nextActions에 포함한다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 'b1', epicId: 'e1', title: 'Blocked Task', description: '', status: 'blocked',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
          blocker: '환경 변수 누락',
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_z', now: 5000 });
    expect(cp.nextActions.some((a) => a.includes('차단 해소'))).toBe(true);
    expect(cp.nextActions.some((a) => a.includes('환경 변수 누락'))).toBe(true);
  });

  it('run이 주어지면 runId와 summary에 반영한다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 't1', epicId: 'e1', title: 'T1', description: '', status: 'done',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    const run: TaskRun = {
      id: 'run_1', taskId: 'task_1', startedAt: 100, model: 'test', status: 'running', assignedTaskIds: [],
    };
    const cp = buildCheckpoint(task, run, { id: 'cp_r', now: 5000 });
    expect(cp.runId).toBe('run_1');
    expect(cp.summary).toContain('run:run_1');
    expect(cp.summary).toContain('1/1');
  });

  it('decisions를 summary 문자열로 변환한다', () => {
    const task = buildTask({
      decisions: [
        { id: 'd1', createdAt: 1, summary: '첫 결정' },
        { id: 'd2', createdAt: 2, summary: '두 번째 결정', rationale: '이유' },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_d', now: 5000 });
    expect(cp.decisions).toEqual(['첫 결정', '두 번째 결정']);
  });

  it('resumePrompt에 차단된 Task와 변경 파일을 포함한다', () => {
    const task = buildTask({
      changedFiles: ['src/a.ts', 'src/b.ts'],
      openQuestions: ['질문1'],
      tasks: [
        {
          id: 'x', epicId: 'e1', title: 'X', description: '', status: 'blocked',
          priority: 'high', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
          blocker: 'bad',
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_p', now: 5000 });
    expect(cp.resumePrompt).toContain('변경된 파일');
    expect(cp.resumePrompt).toContain('src/a.ts');
    expect(cp.resumePrompt).toContain('차단된 Task');
    expect(cp.resumePrompt).toContain('미해결 질문');
  });

  it('id 미지정 시 cp_ 접두사가 붙은 id를 자동 생성한다', () => {
    const cp = buildCheckpoint(buildTask(), undefined, { now: 777 });
    expect(cp.id).toMatch(/^cp_777_/);
  });

  it('run이 없으면 runId 속성은 포함되지 않고 summary에도 run 태그가 없다', () => {
    const cp = buildCheckpoint(buildTask(), undefined, { id: 'cp_nr', now: 0 });
    expect(cp).not.toHaveProperty('runId');
    expect(cp.summary).not.toContain('run:');
  });

  it('blocker가 없는 blocked Task는 nextActions에 "차단 해소 필요"로 들어가지 않는다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 'blk-no-reason', epicId: 'e1', title: 'BlockedNoReason', description: '',
          status: 'blocked', priority: 'medium', size: 'S',
          dependsOn: [], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_b', now: 0 });
    expect(cp.nextActions.some((a) => a.includes('차단 해소'))).toBe(false);
  });

  it('changedFiles/openQuestions는 원본과 독립된 배열 복사본이다', () => {
    const task = buildTask({
      changedFiles: ['orig.ts'],
      openQuestions: ['q'],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_c', now: 0 });
    cp.changedFiles.push('mut.ts');
    cp.openQuestions.push('new-q');
    expect(task.changedFiles).toEqual(['orig.ts']);
    expect(task.openQuestions).toEqual(['q']);
  });

  it('nextActions가 비어 있으면 resumePrompt에 "이어서 수행할 Task 없음" 안내가 표시된다', () => {
    const task = buildTask({
      tasks: [
        {
          id: 't1', epicId: 'e1', title: 'T1', description: '', status: 'done',
          priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_none', now: 0 });
    expect(cp.resumePrompt).toMatch(/이어서 수행할 Task 없음/);
  });

  it('goal이 빈 문자열이면 resumePrompt에 "(미정의)"가 표시된다', () => {
    const task = buildTask({ goal: '' });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_g', now: 0 });
    expect(cp.resumePrompt).toContain('(미정의)');
  });

  it('summary는 완료/전체 개수와 퍼센트를 포함한다', () => {
    const task = buildTask({
      tasks: [
        { id: 't1', epicId: 'e1', title: 'T1', description: '', status: 'done', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 't2', epicId: 'e1', title: 'T2', description: '', status: 'done', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 't3', epicId: 'e1', title: 'T3', description: '', status: 'todo', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 't4', epicId: 'e1', title: 'T4', description: '', status: 'in_progress', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_s', now: 0 });
    expect(cp.summary).toContain('2/4 완료');
    expect(cp.summary).toContain('(50%)');
    expect(cp.summary).toContain('진행 1');
  });

  it('summary "최근 결정" 태그는 마지막 decision의 summary', () => {
    const task = buildTask({
      decisions: [
        { id: 'd1', createdAt: 1, summary: '옛 결정' },
        { id: 'd2', createdAt: 2, summary: '최신 결정' },
      ],
    });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_ld', now: 0 });
    expect(cp.summary).toContain('최근 결정: 최신 결정');
  });

  it('resumePrompt는 제목 섹션과 수용 조건 섹션을 순서대로 포함한다', () => {
    const task = buildTask({ title: '핵심 기능', goal: '목표', acceptanceCriteria: ['AC-1', 'AC-2'] });
    const cp = buildCheckpoint(task, undefined, { id: 'cp_rp', now: 0 });
    const lines = cp.resumePrompt.split('\n');
    const titleIdx = lines.findIndex((l) => l.startsWith('# Task Resume: 핵심 기능'));
    const acIdx = lines.findIndex((l) => l === '## 수용 조건');
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(acIdx).toBeGreaterThan(titleIdx);
  });
});

describe('createCheckpoint (I/O + latestCheckpointId 갱신)', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockSaveCheckpoint.mockReset();
    mockSaveCheckpoint.mockResolvedValue(undefined);
    mockUpdateTask.mockReset();
    mockUpdateTask.mockResolvedValue(undefined);
    mockWriteCheckpointMarkdown.mockReset();
    mockWriteCheckpointMarkdown.mockResolvedValue('/tmp/cp.md');
  });

  it('Task가 없으면 에러를 던진다', async () => {
    mockReadTask.mockResolvedValue(null);
    await expect(createCheckpoint('no_such')).rejects.toThrow(/찾을 수 없습니다/);
  });

  it('storage.saveCheckpoint, writeCheckpointMarkdown, updateTask를 모두 호출한다', async () => {
    const task = buildTask();
    mockReadTask.mockResolvedValue(task);

    const cp = await createCheckpoint('task_1', undefined, { id: 'cp_create', now: 9999 });
    expect(cp.id).toBe('cp_create');
    expect(mockSaveCheckpoint).toHaveBeenCalledWith('task_1', expect.objectContaining({ id: 'cp_create' }));
    expect(mockWriteCheckpointMarkdown).toHaveBeenCalledWith('task_1', expect.objectContaining({ id: 'cp_create' }));
    expect(mockUpdateTask).toHaveBeenCalledWith('task_1', expect.any(Function));
    const updater = mockUpdateTask.mock.calls[0][1] as (t: TaskRecord) => TaskRecord;
    const updated = updater(task);
    expect(updated.latestCheckpointId).toBe('cp_create');
  });
});

describe('listCheckpoints / readCheckpoint 위임', () => {
  beforeEach(() => {
    mockListCheckpoints.mockReset();
    mockReadCheckpoint.mockReset();
  });

  it('listCheckpoints는 storage.listCheckpoints로 위임한다', async () => {
    mockListCheckpoints.mockResolvedValue([{ id: 'cp_1' }]);
    const result = await listCheckpoints('task_1');
    expect(mockListCheckpoints).toHaveBeenCalledWith('task_1');
    expect(result).toEqual([{ id: 'cp_1' }]);
  });

  it('readCheckpoint는 storage.readCheckpoint로 위임한다', async () => {
    mockReadCheckpoint.mockResolvedValue({ id: 'cp_1' });
    const result = await readCheckpoint('task_1', 'cp_1');
    expect(mockReadCheckpoint).toHaveBeenCalledWith('task_1', 'cp_1');
    expect(result).toEqual({ id: 'cp_1' });
  });
});
