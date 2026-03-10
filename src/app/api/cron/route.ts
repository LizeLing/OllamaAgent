import { NextRequest, NextResponse } from 'next/server';
import { loadJobs, addJob } from '@/lib/cron/storage';
import { isValidCronExpression, getNextRunTime, describeCron } from '@/lib/cron/parser';
import { CronJob } from '@/types/cron';
import { withErrorHandler } from '@/lib/api/handler';
import { createCronJobSchema } from '@/lib/api/schemas';
import { AppError } from '@/lib/errors';

export const GET = withErrorHandler('CRON', async () => {
  const jobs = await loadJobs();
  const enriched = jobs.map((job) => ({
    ...job,
    nextRunAt: job.enabled ? getNextRunTime(job.cronExpression) : undefined,
    cronDescription: describeCron(job.cronExpression),
  }));
  return NextResponse.json(enriched);
});

export const POST = withErrorHandler('CRON', async (request: NextRequest) => {
  const body = await request.json();
  const parsed = createCronJobSchema.parse(body);

  if (!isValidCronExpression(parsed.cronExpression)) {
    throw new AppError('유효하지 않은 크론 표현식입니다.', 400, 'INVALID_CRON');
  }

  const job: CronJob = {
    id: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: parsed.name,
    description: parsed.description,
    cronExpression: parsed.cronExpression,
    jobType: parsed.jobType,
    jobConfig: parsed.jobConfig,
    enabled: parsed.enabled,
    createdAt: Date.now(),
    nextRunAt: getNextRunTime(parsed.cronExpression),
    runCount: 0,
  };

  await addJob(job);
  return NextResponse.json(job, { status: 201 });
});
