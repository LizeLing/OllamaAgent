import { NextRequest, NextResponse } from 'next/server';
import { loadJobs, addJob } from '@/lib/cron/storage';
import { isValidCronExpression, getNextRunTime, describeCron } from '@/lib/cron/parser';
import { CronJob } from '@/types/cron';

export async function GET() {
  const jobs = await loadJobs();
  const enriched = jobs.map((job) => ({
    ...job,
    nextRunAt: job.enabled ? getNextRunTime(job.cronExpression) : undefined,
    cronDescription: describeCron(job.cronExpression),
  }));
  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, cronExpression, jobType, jobConfig, enabled } = body;

    if (!name || !cronExpression || !jobType) {
      return NextResponse.json({ error: 'name, cronExpression, jobType은 필수입니다.' }, { status: 400 });
    }

    if (!isValidCronExpression(cronExpression)) {
      return NextResponse.json({ error: '유효하지 않은 크론 표현식입니다.' }, { status: 400 });
    }

    const validTypes = ['agent_run', 'http_request', 'memory_cleanup', 'health_check'];
    if (!validTypes.includes(jobType)) {
      return NextResponse.json({ error: '유효하지 않은 jobType입니다.' }, { status: 400 });
    }

    const job: CronJob = {
      id: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      cronExpression,
      jobType,
      jobConfig: jobConfig || {},
      enabled: enabled ?? false,
      createdAt: Date.now(),
      nextRunAt: getNextRunTime(cronExpression),
      runCount: 0,
    };

    await addJob(job);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
