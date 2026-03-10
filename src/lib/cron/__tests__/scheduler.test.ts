import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../storage', () => ({
  loadJobs: vi.fn(),
  updateJob: vi.fn(),
  appendHistory: vi.fn(),
}));

vi.mock('../parser', () => ({
  shouldRunNow: vi.fn(),
  getNextRunTime: vi.fn(() => Date.now() + 60000),
}));

vi.mock('../job-executor', () => ({
  CronJobExecutor: {
    executeJob: vi.fn(),
  },
}));

import { startScheduler, stopScheduler, isSchedulerRunning } from '../scheduler';
import { loadJobs, updateJob, appendHistory } from '../storage';
import { shouldRunNow } from '../parser';
import { CronJobExecutor } from '../job-executor';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  it('시작 시 running 상태가 된다', () => {
    vi.mocked(loadJobs).mockResolvedValue([]);
    expect(isSchedulerRunning()).toBe(false);
    startScheduler();
    expect(isSchedulerRunning()).toBe(true);
  });

  it('중지 시 running 상태가 해제된다', () => {
    vi.mocked(loadJobs).mockResolvedValue([]);
    startScheduler();
    stopScheduler();
    expect(isSchedulerRunning()).toBe(false);
  });

  it('중복 시작을 방지한다', () => {
    vi.mocked(loadJobs).mockResolvedValue([]);
    startScheduler();
    startScheduler(); // 두 번째 호출은 무시
    expect(isSchedulerRunning()).toBe(true);
  });

  it('시작 후 첫 tick이 CRON_INTERVAL 후에 실행된다', async () => {
    vi.mocked(loadJobs).mockResolvedValue([]);
    startScheduler();
    expect(loadJobs).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);
    expect(loadJobs).toHaveBeenCalledTimes(1);
  });

  it('enabled된 작업만 실행 여부를 확인한다', async () => {
    const jobs = [
      { id: 'enabled', enabled: true, cronExpression: '* * * * *', runCount: 0, jobType: 'health_check', jobConfig: {} },
      { id: 'disabled', enabled: false, cronExpression: '* * * * *', runCount: 0, jobType: 'health_check', jobConfig: {} },
    ];
    vi.mocked(loadJobs).mockResolvedValue(jobs as never);
    vi.mocked(shouldRunNow).mockReturnValue(false);

    startScheduler();
    await vi.advanceTimersByTimeAsync(60000);

    expect(shouldRunNow).toHaveBeenCalledTimes(1);
    expect(shouldRunNow).toHaveBeenCalledWith('* * * * *', undefined);
  });

  it('실행 시간이 되면 작업을 실행한다', async () => {
    const job = {
      id: 'run-me',
      enabled: true,
      cronExpression: '* * * * *',
      runCount: 0,
      jobType: 'health_check',
      jobConfig: {},
    };
    vi.mocked(loadJobs).mockResolvedValue([job] as never);
    vi.mocked(shouldRunNow).mockReturnValue(true);
    vi.mocked(CronJobExecutor.executeJob).mockResolvedValue({
      jobId: 'run-me',
      startedAt: Date.now(),
      completedAt: Date.now(),
      success: true,
      output: 'OK',
    });
    vi.mocked(updateJob).mockResolvedValue(null);
    vi.mocked(appendHistory).mockResolvedValue();

    startScheduler();
    await vi.advanceTimersByTimeAsync(60000);
    // executeJob 후의 .then() 체인을 처리
    await vi.advanceTimersByTimeAsync(0);

    expect(CronJobExecutor.executeJob).toHaveBeenCalledWith(job);
  });

  it('60초마다 tick을 실행한다 (setTimeout 체인)', async () => {
    vi.mocked(loadJobs).mockResolvedValue([]);

    startScheduler();

    await vi.advanceTimersByTimeAsync(60000);
    expect(loadJobs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(loadJobs).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60000);
    expect(loadJobs).toHaveBeenCalledTimes(3);
  });

  it('이미 실행 중인 작업은 건너뛴다', async () => {
    let resolveJob: (v: unknown) => void;
    const slowPromise = new Promise((r) => { resolveJob = r; });

    const job = {
      id: 'slow-job',
      enabled: true,
      cronExpression: '* * * * *',
      runCount: 0,
      jobType: 'health_check',
      jobConfig: {},
    };
    vi.mocked(loadJobs).mockResolvedValue([job] as never);
    vi.mocked(shouldRunNow).mockReturnValue(true);
    vi.mocked(CronJobExecutor.executeJob).mockReturnValue(slowPromise as never);

    startScheduler();
    await vi.advanceTimersByTimeAsync(60000); // 첫 tick - 작업 시작
    await vi.advanceTimersByTimeAsync(60000); // 두 번째 tick - 작업 아직 실행 중

    // 두 번째 tick에서는 같은 작업을 재실행하지 않아야 함
    expect(CronJobExecutor.executeJob).toHaveBeenCalledTimes(1);

    // 작업 완료
    resolveJob!({ jobId: 'slow-job', startedAt: Date.now(), completedAt: Date.now(), success: true, output: 'OK' });
    vi.mocked(updateJob).mockResolvedValue(null);
    vi.mocked(appendHistory).mockResolvedValue();
    await vi.advanceTimersByTimeAsync(0);
  });
});
