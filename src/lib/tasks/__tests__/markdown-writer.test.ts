import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskRecord, TaskCheckpoint } from '@/types/task';

const mockFs = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-md',
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function buildTask(): TaskRecord {
  return {
    id: 'task-1',
    title: '샘플 Task',
    goal: '목표',
    mode: 'task',
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    acceptanceCriteria: [],
    epics: [],
    tasks: [],
    decisions: [],
    changedFiles: [],
    openQuestions: [],
  };
}

function buildCheckpoint(): TaskCheckpoint {
  return {
    id: 'cp-1',
    taskId: 'task-1',
    createdAt: 3000,
    summary: '체크포인트',
    completedTaskIds: [],
    inProgressTaskIds: [],
    blockedTaskIds: [],
    changedFiles: [],
    decisions: [],
    openQuestions: [],
    nextActions: [],
    resumePrompt: '계속 진행',
    markdownPath: '/tmp/test-md/tasks/task-1/checkpoints/cp-1.md',
  };
}

describe('writeTaskMarkdown', () => {
  let writeTaskMarkdown: typeof import('../markdown').writeTaskMarkdown;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    const mod = await import('../markdown');
    writeTaskMarkdown = mod.writeTaskMarkdown;
  });

  it('task.md를 임시 파일에 쓰고 rename한다 (atomic)', async () => {
    const filePath = await writeTaskMarkdown('task-1', buildTask());

    expect(filePath).toBe('/tmp/test-md/tasks/task-1/task.md');

    // 임시 파일에 먼저 writeFile
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = mockFs.writeFile.mock.calls[0];
    expect(String(writeCall[0])).toMatch(/task-1\/task\.md\.tmp\./);
    expect(String(writeCall[1])).toContain('# 샘플 Task');

    // rename으로 실제 파일로 교체
    expect(mockFs.rename).toHaveBeenCalledTimes(1);
    const renameCall = mockFs.rename.mock.calls[0];
    expect(String(renameCall[0])).toMatch(/task-1\/task\.md\.tmp\./);
    expect(String(renameCall[1])).toBe('/tmp/test-md/tasks/task-1/task.md');
  });

  it('쓰기 실패 시 임시 파일을 정리하고 throw한다', async () => {
    mockFs.writeFile.mockRejectedValueOnce(new Error('EACCES'));

    await expect(writeTaskMarkdown('task-1', buildTask())).rejects.toThrow(/EACCES/);

    // 임시 파일 정리 시도
    expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    expect(String(mockFs.unlink.mock.calls[0][0])).toMatch(/task\.md\.tmp\./);
  });

  it('ensureTaskDirectories를 호출해 runs/checkpoints/artifacts를 보장한다', async () => {
    await writeTaskMarkdown('task-1', buildTask());

    const mkdirPaths = mockFs.mkdir.mock.calls.map((c) => String(c[0]));
    expect(mkdirPaths.some((p) => p.endsWith('task-1/runs'))).toBe(true);
    expect(mkdirPaths.some((p) => p.endsWith('task-1/checkpoints'))).toBe(true);
    expect(mkdirPaths.some((p) => p.endsWith('task-1/artifacts'))).toBe(true);
  });

  it('잘못된 taskId는 validateId에서 throw한다', async () => {
    await expect(writeTaskMarkdown('../bad', buildTask())).rejects.toThrow(/잘못된/);
  });
});

describe('writeCheckpointMarkdown', () => {
  let writeCheckpointMarkdown: typeof import('../markdown').writeCheckpointMarkdown;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    const mod = await import('../markdown');
    writeCheckpointMarkdown = mod.writeCheckpointMarkdown;
  });

  it('checkpoint md 경로를 반환하고 atomic하게 쓴다', async () => {
    const filePath = await writeCheckpointMarkdown('task-1', buildCheckpoint());

    expect(filePath).toBe(
      '/tmp/test-md/tasks/task-1/checkpoints/cp-1.md'
    );

    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = mockFs.writeFile.mock.calls[0];
    expect(String(writeCall[0])).toMatch(/cp-1\.md\.tmp\./);
    expect(String(writeCall[1])).toContain('# Checkpoint: 체크포인트');

    expect(mockFs.rename).toHaveBeenCalledTimes(1);
  });

  it('쓰기 실패 시 임시 파일 정리와 throw를 수행한다', async () => {
    mockFs.writeFile.mockRejectedValueOnce(new Error('ENOSPC'));

    await expect(
      writeCheckpointMarkdown('task-1', buildCheckpoint())
    ).rejects.toThrow(/ENOSPC/);

    expect(mockFs.unlink).toHaveBeenCalled();
  });

  it('잘못된 taskId는 throw한다', async () => {
    await expect(
      writeCheckpointMarkdown('../bad', buildCheckpoint())
    ).rejects.toThrow(/잘못된/);
  });

  it('잘못된 checkpointId는 throw한다', async () => {
    const cp = buildCheckpoint();
    cp.id = 'bad id';
    await expect(writeCheckpointMarkdown('task-1', cp)).rejects.toThrow(/잘못된/);
  });
});
