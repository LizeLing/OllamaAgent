import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronJob, CronRunResult } from '@/types/cron';

// vi.hoisted로 선언해야 vi.mock 팩토리에서 참조 가능 (hoisting 문제 방지)
const { mockAtomicWriteJSON, mockSafeReadJSON } = vi.hoisted(() => ({
  mockAtomicWriteJSON: vi.fn().mockResolvedValue(undefined),
  mockSafeReadJSON: vi.fn(),
}));

vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: mockAtomicWriteJSON,
  safeReadJSON: mockSafeReadJSON,
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/mock/data',
}));

vi.mock('../parser', () => ({
  getNextRunTime: vi.fn(() => Date.now() + 60000),
}));

import { loadJobs, saveJobs, addJob, updateJob, removeJob, appendHistory, loadHistory, clearHistory } from '../storage';

const mockJob = (overrides: Partial<CronJob> = {}): CronJob => ({
  id: 'test-job-1',
  name: '테스트 작업',
  cronExpression: '* * * * *',
  jobType: 'health_check',
  jobConfig: {},
  enabled: true,
  createdAt: Date.now(),
  runCount: 0,
  ...overrides,
});

describe('loadJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('저장된 작업 목록을 반환한다', async () => {
    const jobs = [mockJob()];
    mockSafeReadJSON.mockResolvedValue(jobs);

    const result = await loadJobs();
    expect(result).toEqual(jobs);
    expect(mockSafeReadJSON).toHaveBeenCalledWith('/mock/data/cron-jobs.json', null);
  });

  it('파일이 없으면 기본 작업을 생성한다', async () => {
    // safeReadJSON returns null (default value) when file not found
    mockSafeReadJSON.mockResolvedValue(null);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const result = await loadJobs();
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('default-memory-cleanup');
    expect(result[1].id).toBe('default-health-check');
    expect(result[2].id).toBe('default-stats-snapshot');
    expect(mockAtomicWriteJSON).toHaveBeenCalled();
  });
});

describe('saveJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('작업 목록을 JSON 파일에 저장한다', async () => {
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const jobs = [mockJob()];
    await saveJobs(jobs);

    expect(mockAtomicWriteJSON).toHaveBeenCalledWith(
      '/mock/data/cron-jobs.json',
      jobs
    );
  });
});

describe('addJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('작업을 추가한다', async () => {
    const existing = [mockJob({ id: 'existing' })];
    mockSafeReadJSON.mockResolvedValue(existing);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const newJob = mockJob({ id: 'new-job' });
    await addJob(newJob);

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const saved = writeCall[1] as Array<{ id: string }>;
    expect(saved).toHaveLength(2);
    expect(saved[1].id).toBe('new-job');
  });

  it('최대 개수 초과 시 에러를 던진다', async () => {
    const jobs = Array.from({ length: 20 }, (_, i) => mockJob({ id: `job-${i}` }));
    mockSafeReadJSON.mockResolvedValue(jobs);

    await expect(addJob(mockJob({ id: 'overflow' }))).rejects.toThrow('최대 20개');
  });
});

describe('updateJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('기존 작업을 업데이트한다', async () => {
    const jobs = [mockJob({ id: 'target', name: '원본' })];
    mockSafeReadJSON.mockResolvedValue(jobs);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const result = await updateJob('target', { name: '수정됨' });
    expect(result?.name).toBe('수정됨');
  });

  it('존재하지 않는 작업이면 null을 반환한다', async () => {
    mockSafeReadJSON.mockResolvedValue([]);

    const result = await updateJob('nonexistent', { name: 'x' });
    expect(result).toBeNull();
  });
});

describe('removeJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('작업을 삭제하고 true를 반환한다', async () => {
    const jobs = [mockJob({ id: 'to-delete' }), mockJob({ id: 'keep' })];
    mockSafeReadJSON.mockResolvedValue(jobs);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const result = await removeJob('to-delete');
    expect(result).toBe(true);

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const saved = writeCall[1] as Array<{ id: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('keep');
  });

  it('존재하지 않는 작업이면 false를 반환한다', async () => {
    mockSafeReadJSON.mockResolvedValue([]);

    const result = await removeJob('nonexistent');
    expect(result).toBe(false);
  });
});

describe('History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockResult: CronRunResult = {
    jobId: 'job-1',
    startedAt: Date.now(),
    completedAt: Date.now() + 1000,
    success: true,
    output: 'OK',
  };

  it('실행 이력을 추가한다', async () => {
    mockSafeReadJSON.mockResolvedValue([]);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    await appendHistory(mockResult);

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const saved = writeCall[1] as Array<{ jobId: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].jobId).toBe('job-1');
  });

  it('최대 500개를 초과하면 오래된 항목을 제거한다', async () => {
    const history = Array.from({ length: 500 }, (_, i) => ({
      ...mockResult,
      jobId: `job-${i}`,
    }));
    mockSafeReadJSON.mockResolvedValue(history);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    await appendHistory(mockResult);

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const saved = writeCall[1] as Array<{ jobId: string }>;
    expect(saved).toHaveLength(500);
    // 첫 번째 항목이 제거되고 새 항목이 추가됨
    expect(saved[saved.length - 1].jobId).toBe('job-1');
  });

  it('jobId로 이력을 필터링한다', async () => {
    const history = [
      { ...mockResult, jobId: 'job-a' },
      { ...mockResult, jobId: 'job-b' },
      { ...mockResult, jobId: 'job-a' },
    ];
    mockSafeReadJSON.mockResolvedValue(history);

    const result = await loadHistory('job-a');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.jobId === 'job-a')).toBe(true);
  });

  it('파일이 없으면 빈 배열을 반환한다', async () => {
    // safeReadJSON returns default value [] when file not found
    mockSafeReadJSON.mockResolvedValue([]);
    const result = await loadHistory();
    expect(result).toEqual([]);
  });

  it('이력을 초기화한다', async () => {
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    await clearHistory();

    expect(mockAtomicWriteJSON).toHaveBeenCalledWith(
      '/mock/data/cron-history.json',
      []
    );
  });
});
