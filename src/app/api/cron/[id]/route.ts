import { NextRequest, NextResponse } from 'next/server';
import { loadJobs, updateJob, removeJob, loadHistory } from '@/lib/cron/storage';
import { isValidCronExpression, getNextRunTime, describeCron } from '@/lib/cron/parser';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
  }

  const history = await loadHistory(id);
  return NextResponse.json({
    ...job,
    nextRunAt: job.enabled ? getNextRunTime(job.cronExpression) : undefined,
    cronDescription: describeCron(job.cronExpression),
    history,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.cronExpression && !isValidCronExpression(body.cronExpression)) {
    return NextResponse.json({ error: '유효하지 않은 크론 표현식입니다.' }, { status: 400 });
  }

  if (body.cronExpression) {
    body.nextRunAt = getNextRunTime(body.cronExpression);
  }

  const updated = await updateJob(id, body);
  if (!updated) {
    return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = await removeJob(id);
  if (!removed) {
    return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
