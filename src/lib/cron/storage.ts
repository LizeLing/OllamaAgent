import { CronJob, CronRunResult } from '@/types/cron';
import { DATA_DIR } from '@/lib/config/constants';
import { getNextRunTime } from './parser';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import path from 'path';

const JOBS_FILE = path.join(DATA_DIR, 'cron-jobs.json');
const HISTORY_FILE = path.join(DATA_DIR, 'cron-history.json');
const MAX_JOBS = 20;
const MAX_HISTORY = 500;

const DEFAULT_JOBS: CronJob[] = [
  {
    id: 'default-memory-cleanup',
    name: '메모리 정리',
    cronExpression: '0 3 * * *',
    jobType: 'memory_cleanup',
    jobConfig: { maxAgeDays: 30, maxCount: 1000 },
    enabled: false,
    createdAt: Date.now(),
    runCount: 0,
  },
  {
    id: 'default-health-check',
    name: '건강 체크',
    cronExpression: '*/30 * * * *',
    jobType: 'health_check',
    jobConfig: {},
    enabled: false,
    createdAt: Date.now(),
    runCount: 0,
  },
  {
    id: 'default-stats-snapshot',
    name: '통계 스냅샷',
    cronExpression: '0 0 * * *',
    jobType: 'agent_run',
    jobConfig: { prompt: '현재 시스템 상태를 요약해주세요.' },
    enabled: false,
    createdAt: Date.now(),
    runCount: 0,
  },
];

export async function loadJobs(): Promise<CronJob[]> {
  const jobs = await safeReadJSON<CronJob[] | null>(JOBS_FILE, null);
  if (jobs !== null) return jobs;
  // First access: seed defaults
  const defaults = DEFAULT_JOBS.map((j) => ({
    ...j,
    nextRunAt: getNextRunTime(j.cronExpression),
  }));
  await saveJobs(defaults);
  return defaults;
}

export async function saveJobs(jobs: CronJob[]): Promise<void> {
  await atomicWriteJSON(JOBS_FILE, jobs);
}

export async function addJob(job: CronJob): Promise<void> {
  return withFileLock(JOBS_FILE, async () => {
    const jobs = await loadJobs();
    if (jobs.length >= MAX_JOBS) {
      throw new Error(`최대 ${MAX_JOBS}개의 작업만 등록할 수 있습니다.`);
    }
    jobs.push(job);
    await saveJobs(jobs);
  });
}

export async function updateJob(id: string, updates: Partial<CronJob>): Promise<CronJob | null> {
  return withFileLock(JOBS_FILE, async () => {
    const jobs = await loadJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;
    jobs[idx] = { ...jobs[idx], ...updates };
    await saveJobs(jobs);
    return jobs[idx];
  });
}

export async function removeJob(id: string): Promise<boolean> {
  return withFileLock(JOBS_FILE, async () => {
    const jobs = await loadJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    jobs.splice(idx, 1);
    await saveJobs(jobs);
    return true;
  });
}

export async function appendHistory(result: CronRunResult): Promise<void> {
  return withFileLock(HISTORY_FILE, async () => {
    const history = await loadHistory();
    history.push(result);
    // Ring buffer: keep only the latest entries
    while (history.length > MAX_HISTORY) {
      history.shift();
    }
    await atomicWriteJSON(HISTORY_FILE, history);
  });
}

export async function loadHistory(jobId?: string): Promise<CronRunResult[]> {
  const history = await safeReadJSON<CronRunResult[]>(HISTORY_FILE, []);
  if (jobId) {
    return history.filter((r) => r.jobId === jobId);
  }
  return history;
}

export async function clearHistory(): Promise<void> {
  await atomicWriteJSON(HISTORY_FILE, []);
}
