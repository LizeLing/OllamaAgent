import { NextRequest, NextResponse } from 'next/server';
import { loadJobs } from '@/lib/cron/storage';
import { startScheduler, stopScheduler, isSchedulerRunning } from '@/lib/cron/scheduler';

export async function GET() {
  const jobs = await loadJobs();
  const enabledCount = jobs.filter((j) => j.enabled).length;

  return NextResponse.json({
    running: isSchedulerRunning(),
    jobCount: jobs.length,
    enabledCount,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'start') {
    startScheduler();
  } else if (action === 'stop') {
    stopScheduler();
  } else {
    return NextResponse.json({ error: 'action은 "start" 또는 "stop"이어야 합니다.' }, { status: 400 });
  }

  return NextResponse.json({ running: isSchedulerRunning() });
}
