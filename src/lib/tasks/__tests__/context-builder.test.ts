import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskCheckpoint, TaskRecord, TaskRun } from '@/types/task';

const mockReadTask = vi.fn();
const mockReadCheckpoint = vi.fn();
const mockListCheckpoints = vi.fn();
const mockListRuns = vi.fn();

vi.mock('../storage', () => ({
  readTask: (id: string) => mockReadTask(id),
  readCheckpoint: (taskId: string, cpId: string) => mockReadCheckpoint(taskId, cpId),
  listCheckpoints: (id: string) => mockListCheckpoints(id),
  listRuns: (id: string) => mockListRuns(id),
}));

import { buildResumeContext, formatForChat } from '../context-builder';

function buildTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task_1',
    title: 'Sample Task',
    goal: 'Resume 테스트 목표',
    mode: 'task',
    status: 'active',
    createdAt: 100,
    updatedAt: 200,
    acceptanceCriteria: ['AC1', 'AC2'],
    epics: [],
    tasks: [],
    decisions: [],
    changedFiles: [],
    openQuestions: [],
    ...overrides,
  };
}

function buildCheckpoint(overrides: Partial<TaskCheckpoint> = {}): TaskCheckpoint {
  return {
    id: 'cp_1',
    taskId: 'task_1',
    createdAt: 500,
    summary: '진행률 50%',
    completedTaskIds: ['t1'],
    inProgressTaskIds: ['t2'],
    blockedTaskIds: [],
    changedFiles: ['src/a.ts'],
    decisions: ['결정1'],
    openQuestions: [],
    nextActions: ['다음 Task: T2'],
    resumePrompt: '# Resume Prompt\n\n다음 T2를 진행하세요.',
    markdownPath: '/tmp/cp_1.md',
    ...overrides,
  };
}

describe('buildResumeContext', () => {
  beforeEach(() => {
    mockReadTask.mockReset();
    mockReadCheckpoint.mockReset();
    mockListCheckpoints.mockReset();
    mockListRuns.mockReset();
  });

  it('Task가 없으면 에러를 던진다', async () => {
    mockReadTask.mockResolvedValue(null);
    await expect(buildResumeContext('no_task')).rejects.toThrow(/찾을 수 없습니다/);
  });

  it('checkpoint가 있으면 resumePrompt를 userMessage로 사용한다', async () => {
    const task = buildTask({ latestCheckpointId: 'cp_1' });
    const cp = buildCheckpoint();
    mockReadTask.mockResolvedValue(task);
    mockReadCheckpoint.mockResolvedValue(cp);

    const ctx = await buildResumeContext('task_1');
    expect(ctx.taskId).toBe('task_1');
    expect(ctx.checkpointId).toBe('cp_1');
    expect(ctx.userMessage).toContain('Resume Prompt');
    expect(ctx.userMessage).toContain('T2');
    expect(ctx.systemPrompt).toContain('Sample Task');
    expect(ctx.systemPrompt).toContain('AC1');
    expect(ctx.metadata.hasCheckpoint).toBe(true);
  });

  it('checkpoint가 없으면 fallback resumePrompt를 생성한다', async () => {
    const task = buildTask({
      tasks: [
        {
          id: 't1', epicId: 'e1', title: 'Todo1', description: '', status: 'todo',
          priority: 'high', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [],
        },
      ],
    });
    mockReadTask.mockResolvedValue(task);
    mockListCheckpoints.mockResolvedValue([]);
    mockReadCheckpoint.mockResolvedValue(null);

    const ctx = await buildResumeContext('task_1');
    expect(ctx.metadata.hasCheckpoint).toBe(false);
    expect(ctx.checkpointId).toBeUndefined();
    expect(ctx.userMessage).toContain('Task Resume');
    expect(ctx.userMessage).toContain('Todo1');
  });

  it('options.checkpointId가 있으면 해당 checkpoint를 읽는다', async () => {
    const task = buildTask({ latestCheckpointId: 'cp_latest' });
    const cp = buildCheckpoint({ id: 'cp_specific' });
    mockReadTask.mockResolvedValue(task);
    mockReadCheckpoint.mockResolvedValue(cp);

    await buildResumeContext('task_1', { checkpointId: 'cp_specific' });
    expect(mockReadCheckpoint).toHaveBeenCalledWith('task_1', 'cp_specific');
  });

  it('latestCheckpointId가 있으면 우선 사용한다', async () => {
    const task = buildTask({ latestCheckpointId: 'cp_latest' });
    mockReadTask.mockResolvedValue(task);
    mockReadCheckpoint.mockResolvedValue(buildCheckpoint({ id: 'cp_latest' }));

    await buildResumeContext('task_1');
    expect(mockReadCheckpoint).toHaveBeenCalledWith('task_1', 'cp_latest');
  });

  it('latestCheckpointId가 없으면 listCheckpoints로 최신을 조회한다', async () => {
    const task = buildTask();
    mockReadTask.mockResolvedValue(task);
    mockListCheckpoints.mockResolvedValue([
      { id: 'cp_most_recent', taskId: 'task_1', createdAt: 500, summary: '', markdownPath: '' },
    ]);
    mockReadCheckpoint.mockResolvedValue(buildCheckpoint({ id: 'cp_most_recent' }));

    const ctx = await buildResumeContext('task_1');
    expect(mockListCheckpoints).toHaveBeenCalledWith('task_1');
    expect(ctx.checkpointId).toBe('cp_most_recent');
  });

  it('systemPrompt에 Task 상태 집계를 포함한다', async () => {
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
          blocker: 'bad',
        },
      ],
    });
    mockReadTask.mockResolvedValue(task);
    mockListCheckpoints.mockResolvedValue([]);

    const ctx = await buildResumeContext('task_1');
    expect(ctx.metadata.totalTaskCount).toBe(3);
    expect(ctx.metadata.completedTaskCount).toBe(1);
    expect(ctx.metadata.inProgressTaskCount).toBe(1);
    expect(ctx.metadata.blockedTaskCount).toBe(1);
    expect(ctx.systemPrompt).toContain('T1');
    expect(ctx.systemPrompt).toContain('T2');
    expect(ctx.systemPrompt).toContain('blocker: bad');
  });

  it('includeRecentRun 옵션이 있으면 Run 요약을 포함한다', async () => {
    const task = buildTask();
    const run: TaskRun = {
      id: 'run_1', taskId: 'task_1', startedAt: 0, endedAt: 5000, model: 'm',
      status: 'completed', assignedTaskIds: [], summary: 'Run 완료',
    };
    mockReadTask.mockResolvedValue(task);
    mockListCheckpoints.mockResolvedValue([]);
    mockListRuns.mockResolvedValue([run]);

    const ctx = await buildResumeContext('task_1', { includeRecentRun: true });
    expect(ctx.metadata.includedRecentRun).toBe(true);
    expect(ctx.systemPrompt).toContain('run_1');
    expect(ctx.systemPrompt).toContain('Run 완료');
  });

  it('includeRecentRun이 기본 false면 Run 조회를 스킵한다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const ctx = await buildResumeContext('task_1');
    expect(mockListRuns).not.toHaveBeenCalled();
    expect(ctx.metadata.includedRecentRun).toBe(false);
  });

  it('memorySearch가 주어지면 결과를 systemPrompt에 포함한다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const memorySearch = vi.fn().mockResolvedValue(['기억1', '기억2']);

    const ctx = await buildResumeContext('task_1', { memorySearch, topK: 2 });
    expect(memorySearch).toHaveBeenCalledWith(expect.stringContaining('Sample Task'), 2);
    expect(ctx.systemPrompt).toContain('기억1');
    expect(ctx.metadata.memoryHits).toBe(2);
  });

  it('memorySearch 실패 시 컨텍스트 조립은 계속된다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const memorySearch = vi.fn().mockRejectedValue(new Error('embed fail'));

    const ctx = await buildResumeContext('task_1', { memorySearch });
    expect(ctx.metadata.memoryHits).toBe(0);
    expect(ctx.systemPrompt).toContain('Sample Task');
  });

  it('knowledgeSearch 결과에 source 태그를 붙인다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const knowledgeSearch = vi.fn().mockResolvedValue([
      { text: '설계 문서 요약', source: 'docs/plans/x.md' },
    ]);

    const ctx = await buildResumeContext('task_1', { knowledgeSearch });
    expect(ctx.systemPrompt).toContain('설계 문서 요약');
    expect(ctx.systemPrompt).toContain('docs/plans/x.md');
    expect(ctx.metadata.knowledgeHits).toBe(1);
  });

  it('기본 옵션에서는 memory/knowledge가 호출되지 않는다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const ctx = await buildResumeContext('task_1');
    expect(ctx.metadata.memoryHits).toBe(0);
    expect(ctx.metadata.knowledgeHits).toBe(0);
  });

  it('knowledgeSearch 실패해도 컨텍스트 조립은 계속된다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const knowledgeSearch = vi.fn().mockRejectedValue(new Error('kb fail'));

    const ctx = await buildResumeContext('task_1', { knowledgeSearch });

    expect(ctx.metadata.knowledgeHits).toBe(0);
    expect(ctx.systemPrompt).toContain('Sample Task');
  });

  it('Task 목록은 상태별 그룹 순서(in_progress→blocked→todo→done→dropped)로 렌더된다', async () => {
    const task = buildTask({
      tasks: [
        { id: 'done-x', epicId: 'e1', title: 'Done X', description: '', status: 'done', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 'todo-y', epicId: 'e1', title: 'Todo Y', description: '', status: 'todo', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 'blocked-z', epicId: 'e1', title: 'Blocked Z', description: '', status: 'blocked', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        { id: 'ip-a', epicId: 'e1', title: 'InProgress A', description: '', status: 'in_progress', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
      ],
    });
    mockReadTask.mockResolvedValue(task);
    mockListCheckpoints.mockResolvedValue([]);

    const ctx = await buildResumeContext('task_1');
    const section = ctx.systemPrompt.split('## Task 목록')[1] ?? '';
    const ipIdx = section.indexOf('InProgress A');
    const blkIdx = section.indexOf('Blocked Z');
    const todoIdx = section.indexOf('Todo Y');
    const doneIdx = section.indexOf('Done X');

    expect(ipIdx).toBeGreaterThan(-1);
    expect(ipIdx).toBeLessThan(blkIdx);
    expect(blkIdx).toBeLessThan(todoIdx);
    expect(todoIdx).toBeLessThan(doneIdx);
  });

  it('goal이 빈 문자열이면 systemPrompt에 "(미정의)"가 포함된다', async () => {
    mockReadTask.mockResolvedValue(buildTask({ goal: '' }));
    mockListCheckpoints.mockResolvedValue([]);
    const ctx = await buildResumeContext('task_1');
    expect(ctx.systemPrompt).toContain('(미정의)');
  });

  it('Epic 섹션은 epics가 있을 때만 렌더된다', async () => {
    mockReadTask.mockResolvedValueOnce(buildTask({ epics: [] }));
    mockListCheckpoints.mockResolvedValueOnce([]);
    const withoutEpics = await buildResumeContext('task_1');
    expect(withoutEpics.systemPrompt).not.toContain('## Epic');

    mockReadTask.mockResolvedValueOnce(
      buildTask({
        epics: [{ id: 'e1', title: 'Has Epic', description: '', status: 'in_progress', taskIds: [] }],
      })
    );
    mockListCheckpoints.mockResolvedValueOnce([]);
    const withEpics = await buildResumeContext('task_1');
    expect(withEpics.systemPrompt).toContain('## Epic');
    expect(withEpics.systemPrompt).toContain('Has Epic');
  });

  it('includeRecentRun이 true여도 runs가 없으면 Run 섹션을 렌더하지 않는다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    mockListRuns.mockResolvedValue([]);

    const ctx = await buildResumeContext('task_1', { includeRecentRun: true });

    expect(ctx.systemPrompt).not.toContain('## 최근 Run');
    expect(ctx.metadata.includedRecentRun).toBe(false);
  });

  it('listRuns 결과가 3개 초과면 systemPrompt에 최대 3개까지만 포함된다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    mockListRuns.mockResolvedValue([
      { id: 'r-1', taskId: 'task_1', startedAt: 0, endedAt: 1000, model: 'm', status: 'completed', assignedTaskIds: [] },
      { id: 'r-2', taskId: 'task_1', startedAt: 0, endedAt: 1000, model: 'm', status: 'completed', assignedTaskIds: [] },
      { id: 'r-3', taskId: 'task_1', startedAt: 0, endedAt: 1000, model: 'm', status: 'completed', assignedTaskIds: [] },
      { id: 'r-4', taskId: 'task_1', startedAt: 0, endedAt: 1000, model: 'm', status: 'completed', assignedTaskIds: [] },
    ]);

    const ctx = await buildResumeContext('task_1', { includeRecentRun: true });

    expect(ctx.systemPrompt).toContain('r-1');
    expect(ctx.systemPrompt).toContain('r-3');
    expect(ctx.systemPrompt).not.toContain('r-4');
  });

  it('topK 기본값은 3이다 — memorySearch에 3이 전달된다', async () => {
    mockReadTask.mockResolvedValue(buildTask());
    mockListCheckpoints.mockResolvedValue([]);
    const memorySearch = vi.fn().mockResolvedValue([]);

    await buildResumeContext('task_1', { memorySearch });

    expect(memorySearch).toHaveBeenCalledWith(expect.any(String), 3);
  });
});

describe('formatForChat 추가', () => {
  it('결과는 정확히 2개의 메시지이고 순서는 system, user이다', () => {
    const messages = formatForChat({
      taskId: 't',
      systemPrompt: 'SP',
      userMessage: 'UM',
      metadata: {
        title: 't', goal: 'g', status: 'active',
        completedTaskCount: 0, inProgressTaskCount: 0, blockedTaskCount: 0, totalTaskCount: 0,
        hasCheckpoint: false, memoryHits: 0, knowledgeHits: 0, includedRecentRun: false,
      },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });
});

describe('formatForChat', () => {
  it('system + user 두 메시지로 변환한다', () => {
    const messages = formatForChat({
      taskId: 't',
      systemPrompt: 'SYS',
      userMessage: 'USER',
      metadata: {
        title: '', goal: '', status: 'active',
        completedTaskCount: 0, inProgressTaskCount: 0, blockedTaskCount: 0, totalTaskCount: 0,
        hasCheckpoint: false, memoryHits: 0, knowledgeHits: 0, includedRecentRun: false,
      },
    });
    expect(messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'USER' },
    ]);
  });
});
