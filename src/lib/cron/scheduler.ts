import { loadJobs, updateJob, appendHistory } from './storage';
import { shouldRunNow, getNextRunTime } from './parser';
import { CronJobExecutor } from './job-executor';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (intervalId) return;
  console.log('[CRON] Scheduler started');
  intervalId = setInterval(tick, 60_000);
  tick();
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[CRON] Scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return intervalId !== null;
}

async function tick(): Promise<void> {
  try {
    const jobs = await loadJobs();
    for (const job of jobs) {
      if (!job.enabled) continue;
      if (shouldRunNow(job.cronExpression, job.lastRunAt)) {
        CronJobExecutor.executeJob(job)
          .then(async (result) => {
            await updateJob(job.id, {
              lastRunAt: Date.now(),
              runCount: job.runCount + 1,
              nextRunAt: getNextRunTime(job.cronExpression),
            });
            await appendHistory(result);
          })
          .catch((err) => console.error('[CRON] Job execution error:', err));
      }
    }
  } catch (err) {
    console.error('[CRON] Tick error:', err);
  }
}
