import { loadJobs, updateJob, appendHistory } from './storage';
import { shouldRunNow, getNextRunTime } from './parser';
import { CronJobExecutor } from './job-executor';
import { logger } from '@/lib/logger';
import { TIMEOUTS } from '@/lib/config/timeouts';

let timeoutId: ReturnType<typeof setTimeout> | null = null;
const runningJobs = new Set<string>();

export function startScheduler(): void {
  if (timeoutId) return;
  logger.info('CRON', 'Scheduler started');
  scheduleTick();
}

export function stopScheduler(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  runningJobs.clear();
  logger.info('CRON', 'Scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return timeoutId !== null;
}

function scheduleTick(): void {
  timeoutId = setTimeout(async () => {
    await tick();
    if (timeoutId !== null) scheduleTick(); // 스케줄러가 중지되지 않았으면 다음 tick 예약
  }, TIMEOUTS.CRON_INTERVAL);
}

async function tick(): Promise<void> {
  try {
    const jobs = await loadJobs();
    for (const job of jobs) {
      if (!job.enabled) continue;
      if (runningJobs.has(job.id)) continue; // 이미 실행 중인 작업 건너뛰기
      if (shouldRunNow(job.cronExpression, job.lastRunAt)) {
        runningJobs.add(job.id);
        CronJobExecutor.executeJob(job)
          .then(async (result) => {
            await updateJob(job.id, {
              lastRunAt: Date.now(),
              runCount: job.runCount + 1,
              nextRunAt: getNextRunTime(job.cronExpression),
            });
            await appendHistory(result);
          })
          .catch(async (err) => {
            logger.error('CRON', `Job ${job.id} execution error`, err);
            // 실패 시에도 lastRunAt 업데이트하여 무한 재실행 방지
            await updateJob(job.id, {
              lastRunAt: Date.now(),
              nextRunAt: getNextRunTime(job.cronExpression),
            }).catch(() => {});
          })
          .finally(() => {
            runningJobs.delete(job.id);
          });
      }
    }
  } catch (err) {
    logger.error('CRON', 'Tick error', err);
  }
}
