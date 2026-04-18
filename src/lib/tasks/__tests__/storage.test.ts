import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-tasks',
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
const mockSafeReadJSON = vi.fn();

vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: mockAtomicWriteJSON,
  safeReadJSON: mockSafeReadJSON,
}));

import type { TaskRecord, TaskRun, TaskCheckpoint } from '@/types/task';

function buildTask(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: '테스트 Task',
    goal: 'Task Mode 저장소 검증',
    mode: 'task',
    status: 'active',
    createdAt: 1000,
    updatedAt: 1000,
    acceptanceCriteria: [],
    epics: [],
    tasks: [],
    decisions: [],
    changedFiles: [],
    openQuestions: [],
    ...overrides,
  };
}

function buildRun(taskId: string, id: string, overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id,
    taskId,
    startedAt: 2000,
    model: 'qwen3.5:9b',
    status: 'running',
    assignedTaskIds: [],
    ...overrides,
  };
}

function buildCheckpoint(
  taskId: string,
  id: string,
  overrides: Partial<TaskCheckpoint> = {}
): TaskCheckpoint {
  return {
    id,
    taskId,
    createdAt: 3000,
    summary: 'cp summary',
    completedTaskIds: [],
    inProgressTaskIds: [],
    blockedTaskIds: [],
    changedFiles: [],
    decisions: [],
    openQuestions: [],
    nextActions: [],
    resumePrompt: 'resume',
    markdownPath: '/tmp/test-tasks/tasks/tid/checkpoints/cp1.md',
    ...overrides,
  };
}

describe('Task Storage', () => {
  let mod: typeof import('../storage');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.rm.mockResolvedValue(undefined);
    mockSafeReadJSON.mockResolvedValue([]);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    mod = await import('../storage');
  });

  describe('ID 검증', () => {
    it('path traversal을 거부한다', async () => {
      await expect(mod.readTask('../etc/passwd')).resolves.toBeNull();
      await expect(mod.createTask(buildTask('../pwned'))).rejects.toThrow(/잘못된/);
    });

    it('빈 id를 거부한다', async () => {
      await expect(mod.createTask(buildTask(''))).rejects.toThrow(/잘못된/);
    });

    it('유효한 id를 허용한다', async () => {
      const result = await mod.readTask('task-abc-123');
      expect(result).toBeNull();
    });
  });

  describe('createTask', () => {
    it('task.json과 인덱스를 작성한다', async () => {
      mockSafeReadJSON.mockImplementation((_file: string, fallback: unknown) => {
        return Promise.resolve(fallback);
      });

      await mod.createTask(buildTask('t1'));

      const taskWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as string).endsWith('t1/task.json')
      );
      expect(taskWrite).toBeDefined();

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).endsWith('tasks/index.json')
      );
      expect(indexWrite).toBeDefined();
      const index = indexWrite![1] as Array<{ id: string }>;
      expect(index[0].id).toBe('t1');
    });

    it('이미 존재하면 거부한다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce(buildTask('t1'));

      await expect(mod.createTask(buildTask('t1'))).rejects.toThrow(/이미 존재/);
    });
  });

  describe('listTasks', () => {
    it('updatedAt 내림차순으로 정렬한다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([
        { id: 'a', title: 'A', goal: '', status: 'active', createdAt: 1, updatedAt: 100, epicCount: 0, taskCount: 0, completedTaskCount: 0 },
        { id: 'b', title: 'B', goal: '', status: 'active', createdAt: 1, updatedAt: 200, epicCount: 0, taskCount: 0, completedTaskCount: 0 },
      ]);

      const result = await mod.listTasks();
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });
  });

  describe('updateTask', () => {
    it('updater로 상태를 갱신하고 updatedAt을 현재 시각으로 바꾼다', async () => {
      const existing = buildTask('t1', { title: '이전', updatedAt: 1000 });
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(existing));
      mockSafeReadJSON.mockResolvedValue([]);

      const before = Date.now();
      const result = await mod.updateTask('t1', (t) => ({ ...t, title: '새 제목' }));

      expect(result.title).toBe('새 제목');
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('존재하지 않는 task에서 throw한다', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      await expect(mod.updateTask('missing', (t) => t)).rejects.toThrow(/찾을 수 없/);
    });

    it('id 변경을 거부한다', async () => {
      const existing = buildTask('t1');
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(existing));

      await expect(
        mod.updateTask('t1', (t) => ({ ...t, id: 'hacked' }))
      ).rejects.toThrow(/ID 변경/);
    });

    it('완료된 task 수를 메타에 반영한다', async () => {
      const existing = buildTask('t1', {
        tasks: [
          { id: 'a', epicId: 'e1', title: 'A', description: '', status: 'done', priority: 'medium', size: 'M', dependsOn: [], definitionOfDone: [], subtasks: [] },
          { id: 'b', epicId: 'e1', title: 'B', description: '', status: 'todo', priority: 'medium', size: 'M', dependsOn: [], definitionOfDone: [], subtasks: [] },
        ],
      });
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(existing));
      mockSafeReadJSON.mockResolvedValue([]);

      await mod.updateTask('t1', (t) => t);

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).endsWith('tasks/index.json')
      );
      expect(indexWrite).toBeDefined();
      const index = indexWrite![1] as Array<{ completedTaskCount: number; taskCount: number }>;
      expect(index[0].completedTaskCount).toBe(1);
      expect(index[0].taskCount).toBe(2);
    });
  });

  describe('deleteTask', () => {
    it('디렉토리를 재귀 삭제하고 인덱스에서 제거한다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([
        { id: 't1', title: 'X', goal: '', status: 'active', createdAt: 1, updatedAt: 1, epicCount: 0, taskCount: 0, completedTaskCount: 0 },
        { id: 't2', title: 'Y', goal: '', status: 'active', createdAt: 1, updatedAt: 1, epicCount: 0, taskCount: 0, completedTaskCount: 0 },
      ]);

      await mod.deleteTask('t1');

      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining('tasks/t1'),
        expect.objectContaining({ recursive: true, force: true })
      );

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).endsWith('tasks/index.json')
      );
      expect(indexWrite).toBeDefined();
      const index = indexWrite![1] as Array<{ id: string }>;
      expect(index).toHaveLength(1);
      expect(index[0].id).toBe('t2');
    });
  });

  describe('saveRun', () => {
    it('run 파일을 기록한다', async () => {
      await mod.saveRun('t1', buildRun('t1', 'r1'));

      const runWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).endsWith('runs/r1.json')
      );
      expect(runWrite).toBeDefined();
    });

    it('run.taskId와 taskId 불일치 시 throw', async () => {
      await expect(
        mod.saveRun('t1', buildRun('t2', 'r1'))
      ).rejects.toThrow(/일치/);
    });
  });

  describe('listRuns', () => {
    it('시작 시각 내림차순으로 정렬한다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['r1.json', 'r2.json', 'notes.txt']);
      mockSafeReadJSON
        .mockResolvedValueOnce(buildRun('t1', 'r1', { startedAt: 100 }))
        .mockResolvedValueOnce(buildRun('t1', 'r2', { startedAt: 200 }));

      const runs = await mod.listRuns('t1');
      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe('r2');
      expect(runs[1].id).toBe('r1');
    });

    it('디렉토리 없으면 빈 배열', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));
      const runs = await mod.listRuns('missing');
      expect(runs).toEqual([]);
    });
  });

  describe('saveCheckpoint / listCheckpoints', () => {
    it('checkpoint 파일을 기록하고 요약을 정리한다', async () => {
      await mod.saveCheckpoint('t1', buildCheckpoint('t1', 'cp1'));

      const cpWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as string).endsWith('checkpoints/cp1.json')
      );
      expect(cpWrite).toBeDefined();
    });

    it('checkpoint.taskId 불일치 시 throw', async () => {
      await expect(
        mod.saveCheckpoint('t1', buildCheckpoint('wrong', 'cp1'))
      ).rejects.toThrow(/일치/);
    });

    it('createdAt 내림차순으로 요약을 반환한다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['cp1.json', 'cp2.json']);
      mockSafeReadJSON
        .mockResolvedValueOnce(buildCheckpoint('t1', 'cp1', { createdAt: 100 }))
        .mockResolvedValueOnce(buildCheckpoint('t1', 'cp2', { createdAt: 200 }));

      const summaries = await mod.listCheckpoints('t1');
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe('cp2');
      expect(summaries[1].id).toBe('cp1');
    });
  });

  describe('경로 헬퍼', () => {
    it('getTaskDirectoryPath는 DATA_DIR/tasks/{id}를 반환한다', () => {
      expect(mod.getTaskDirectoryPath('t1')).toBe('/tmp/test-tasks/tasks/t1');
    });

    it('getTaskMarkdownPath는 task.md 경로를 반환한다', () => {
      expect(mod.getTaskMarkdownPath('t1')).toBe(
        '/tmp/test-tasks/tasks/t1/task.md'
      );
    });

    it('getCheckpointMarkdownPath는 checkpoint md 경로를 반환한다', () => {
      expect(mod.getCheckpointMarkdownPath('t1', 'cp1')).toBe(
        '/tmp/test-tasks/tasks/t1/checkpoints/cp1.md'
      );
    });

    it('잘못된 id는 즉시 throw한다', () => {
      expect(() => mod.getTaskFilePath('../danger')).toThrow(/잘못된/);
    });
  });

  describe('readTask / readRun / readCheckpoint null 반환', () => {
    it('readTask는 파싱 실패 시 null을 반환한다', async () => {
      mockFs.readFile.mockResolvedValueOnce('not-valid-json{');
      expect(await mod.readTask('t1')).toBeNull();
    });

    it('readRun은 잘못된 taskId이면 null을 반환한다', async () => {
      expect(await mod.readRun('../bad', 'r1')).toBeNull();
    });

    it('readRun은 잘못된 runId이면 null을 반환한다', async () => {
      expect(await mod.readRun('t1', 'bad id')).toBeNull();
    });

    it('readCheckpoint는 파싱 실패 시 null을 반환한다', async () => {
      mockFs.readFile.mockResolvedValueOnce('{not json');
      expect(await mod.readCheckpoint('t1', 'cp1')).toBeNull();
    });

    it('readCheckpoint는 잘못된 checkpointId이면 null을 반환한다', async () => {
      expect(await mod.readCheckpoint('t1', 'bad id')).toBeNull();
    });
  });

  describe('listRuns / listCheckpoints 에지 케이스', () => {
    it('listRuns는 손상된 파일을 스킵한다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['r1.json', 'r2.json']);
      mockSafeReadJSON
        .mockResolvedValueOnce(buildRun('t1', 'r1', { startedAt: 100 }))
        .mockResolvedValueOnce(null);

      const runs = await mod.listRuns('t1');
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe('r1');
    });

    it('listRuns는 .json이 아닌 파일을 무시한다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['r1.json', 'README', 'notes.txt']);
      mockSafeReadJSON.mockResolvedValueOnce(buildRun('t1', 'r1'));

      const runs = await mod.listRuns('t1');
      expect(runs).toHaveLength(1);
    });

    it('listCheckpoints는 손상된 파일을 스킵하고 .json만 포함한다', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        'cp1.json',
        'cp1.md',
        'broken.json',
      ]);
      mockSafeReadJSON
        .mockResolvedValueOnce(buildCheckpoint('t1', 'cp1'))
        .mockResolvedValueOnce(null);

      const summaries = await mod.listCheckpoints('t1');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('cp1');
    });

    it('listCheckpoints는 runId가 있으면 summary에 포함한다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['cp1.json']);
      mockSafeReadJSON.mockResolvedValueOnce(
        buildCheckpoint('t1', 'cp1', { runId: 'run-xyz' })
      );

      const summaries = await mod.listCheckpoints('t1');
      expect(summaries[0].runId).toBe('run-xyz');
    });

    it('listCheckpoints는 runId가 없으면 summary에서 생략된다', async () => {
      mockFs.readdir.mockResolvedValueOnce(['cp1.json']);
      mockSafeReadJSON.mockResolvedValueOnce(buildCheckpoint('t1', 'cp1'));

      const summaries = await mod.listCheckpoints('t1');
      expect(summaries[0]).not.toHaveProperty('runId');
    });

    it('listCheckpoints는 디렉토리 없으면 빈 배열을 반환한다', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));
      expect(await mod.listCheckpoints('missing')).toEqual([]);
    });
  });

  describe('ensureTaskDirectories', () => {
    it('runs/checkpoints/artifacts 3개 디렉토리를 생성한다', async () => {
      await mod.ensureTaskDirectories('t1');

      const mkdirPaths = mockFs.mkdir.mock.calls.map((c) => c[0] as string);
      expect(mkdirPaths.some((p) => p.endsWith('t1/runs'))).toBe(true);
      expect(mkdirPaths.some((p) => p.endsWith('t1/checkpoints'))).toBe(true);
      expect(mkdirPaths.some((p) => p.endsWith('t1/artifacts'))).toBe(true);
    });

    it('잘못된 taskId는 throw한다', async () => {
      await expect(mod.ensureTaskDirectories('../bad')).rejects.toThrow(/잘못된/);
    });
  });

  describe('createTask 인덱스 메타 세부', () => {
    it('epics/tasks를 올바르게 세어 meta에 반영한다', async () => {
      mockSafeReadJSON.mockImplementation((_f: string, fb: unknown) =>
        Promise.resolve(fb)
      );

      const task = buildTask('counter', {
        epics: [
          { id: 'e1', title: 'E1', description: '', status: 'todo', taskIds: ['a'] },
          { id: 'e2', title: 'E2', description: '', status: 'todo', taskIds: ['b'] },
        ],
        tasks: [
          { id: 'a', epicId: 'e1', title: 'A', description: '', status: 'done', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
          { id: 'b', epicId: 'e2', title: 'B', description: '', status: 'todo', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
          { id: 'c', epicId: 'e1', title: 'C', description: '', status: 'done', priority: 'medium', size: 'S', dependsOn: [], definitionOfDone: [], subtasks: [] },
        ],
      });
      await mod.createTask(task);

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('tasks/index.json')
      );
      const index = indexWrite![1] as Array<{ epicCount: number; taskCount: number; completedTaskCount: number }>;
      expect(index[0].epicCount).toBe(2);
      expect(index[0].taskCount).toBe(3);
      expect(index[0].completedTaskCount).toBe(2);
    });

    it('latestCheckpointId/activeRunId를 meta에 전파한다', async () => {
      mockSafeReadJSON.mockImplementation((_f: string, fb: unknown) =>
        Promise.resolve(fb)
      );

      const task = buildTask('propagate', {
        latestCheckpointId: 'cp-1',
        activeRunId: 'run-1',
      });
      await mod.createTask(task);

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('tasks/index.json')
      );
      const index = indexWrite![1] as Array<{ latestCheckpointId?: string; activeRunId?: string }>;
      expect(index[0].latestCheckpointId).toBe('cp-1');
      expect(index[0].activeRunId).toBe('run-1');
    });

    it('latestCheckpointId/activeRunId가 없으면 meta에서 생략된다', async () => {
      mockSafeReadJSON.mockImplementation((_f: string, fb: unknown) =>
        Promise.resolve(fb)
      );

      await mod.createTask(buildTask('empty'));

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('tasks/index.json')
      );
      const index = indexWrite![1] as Array<Record<string, unknown>>;
      expect(index[0]).not.toHaveProperty('latestCheckpointId');
      expect(index[0]).not.toHaveProperty('activeRunId');
    });
  });

  describe('deleteTask 에지 케이스', () => {
    it('디렉토리 삭제 실패해도 인덱스 정리는 수행한다', async () => {
      mockFs.rm.mockRejectedValueOnce(new Error('EACCES'));
      mockSafeReadJSON.mockResolvedValueOnce([
        { id: 't1', title: 'X', goal: '', status: 'active', createdAt: 1, updatedAt: 1, epicCount: 0, taskCount: 0, completedTaskCount: 0 },
      ]);

      await expect(mod.deleteTask('t1')).resolves.not.toThrow();

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('tasks/index.json')
      );
      expect(indexWrite).toBeDefined();
      const index = indexWrite![1] as Array<unknown>;
      expect(index).toHaveLength(0);
    });

    it('인덱스에 없는 id는 인덱스 쓰기를 스킵한다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([]);

      await mod.deleteTask('not-in-index');

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('tasks/index.json')
      );
      expect(indexWrite).toBeUndefined();
    });

    it('잘못된 taskId는 throw한다', async () => {
      await expect(mod.deleteTask('../bad')).rejects.toThrow(/잘못된/);
    });
  });
});
