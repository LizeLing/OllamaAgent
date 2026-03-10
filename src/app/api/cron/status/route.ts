import { NextRequest, NextResponse } from 'next/server';
import { loadJobs } from '@/lib/cron/storage';
import { startScheduler, stopScheduler, isSchedulerRunning } from '@/lib/cron/scheduler';
import { withErrorHandler } from '@/lib/api/handler';
import { cronStatusActionSchema } from '@/lib/api/schemas';

export const GET = withErrorHandler('CRON_STATUS', async () => {
  const jobs = await loadJobs();
  const enabledCount = jobs.filter((j) => j.enabled).length;

  return NextResponse.json({
    running: isSchedulerRunning(),
    jobCount: jobs.length,
    enabledCount,
  });
});

export const POST = withErrorHandler('CRON_STATUS', async (request: NextRequest) => {
  const body = await request.json();
  const { action } = cronStatusActionSchema.parse(body);

  if (action === 'start') {
    startScheduler();
  } else {
    stopScheduler();
  }

  return NextResponse.json({ running: isSchedulerRunning() });
});
