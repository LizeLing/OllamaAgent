import { NextRequest, NextResponse } from 'next/server';
import { createCheckpoint, listCheckpoints } from '@/lib/tasks/checkpoint';
import { readTask, readRun } from '@/lib/tasks/storage';
import { logger, getErrorMessage } from '@/lib/logger';

/**
 * POST /api/tasks/[id]/checkpoint
 * Body: { runId?: string }
 * 현재 Task 상태에서 Checkpoint를 생성해 JSON + Markdown으로 저장한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const task = await readTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const runIdRaw = body && typeof body === 'object' ? (body as { runId?: unknown }).runId : undefined;
    const runId = typeof runIdRaw === 'string' && runIdRaw.length > 0 ? runIdRaw : undefined;
    const run = runId ? await readRun(id, runId) : undefined;
    if (runId && !run) {
      return NextResponse.json(
        { error: `runId(${runId})에 해당하는 Run을 찾을 수 없습니다.` },
        { status: 404 },
      );
    }

    const checkpoint = await createCheckpoint(id, run ?? undefined);
    return NextResponse.json(checkpoint, { status: 201 });
  } catch (err) {
    logger.error('TASKS', `POST /api/tasks/${id}/checkpoint 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/**
 * GET /api/tasks/[id]/checkpoint
 * Task의 Checkpoint 목록(최신순)을 반환한다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const task = await readTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task를 찾을 수 없습니다.' }, { status: 404 });
    }
    const checkpoints = await listCheckpoints(id);
    return NextResponse.json({ checkpoints });
  } catch (err) {
    logger.error('TASKS', `GET /api/tasks/${id}/checkpoint 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
