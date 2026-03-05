import { NextRequest, NextResponse } from 'next/server';
import { loadJobs, updateJob, appendHistory } from '@/lib/cron/storage';
import { getNextRunTime } from '@/lib/cron/parser';
import { CronJobExecutor } from '@/lib/cron/job-executor';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === id);

  if (!job) {
    return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
  }

  const result = await CronJobExecutor.executeJob(job);

  await updateJob(id, {
    lastRunAt: Date.now(),
    runCount: job.runCount + 1,
    nextRunAt: getNextRunTime(job.cronExpression),
  });
  await appendHistory(result);

  return NextResponse.json(result);
}
