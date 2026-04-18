import { NextRequest, NextResponse } from 'next/server';
import {
  readTask,
  updateTask,
  deleteTask,
} from '@/lib/tasks/storage';
import { writeTaskMarkdown } from '@/lib/tasks/markdown';
import { logger, getErrorMessage } from '@/lib/logger';
import type { TaskRecord, TaskStatus } from '@/types/task';

const ALLOWED_STATUSES: TaskStatus[] = ['active', 'blocked', 'review', 'done', 'archived'];

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
    return NextResponse.json(task);
  } catch (err) {
    logger.error('TASKS', `GET /api/tasks/${id} 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
    }

    const existing = await readTask(id);
    if (!existing) {
      return NextResponse.json({ error: 'Task를 찾을 수 없습니다.' }, { status: 404 });
    }

    const patch: Partial<TaskRecord> = {};
    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (typeof body.goal === 'string') {
      patch.goal = body.goal;
    }
    if (typeof body.status === 'string') {
      if (!ALLOWED_STATUSES.includes(body.status as TaskStatus)) {
        return NextResponse.json(
          { error: `status는 ${ALLOWED_STATUSES.join('|')} 중 하나여야 합니다.` },
          { status: 400 },
        );
      }
      patch.status = body.status as TaskStatus;
    }
    if (Array.isArray(body.acceptanceCriteria)) {
      patch.acceptanceCriteria = body.acceptanceCriteria.filter(
        (v: unknown) => typeof v === 'string',
      );
    }
    if (Array.isArray(body.openQuestions)) {
      patch.openQuestions = body.openQuestions.filter(
        (v: unknown) => typeof v === 'string',
      );
    }
    if (typeof body.canonicalPlan === 'string') {
      patch.canonicalPlan = body.canonicalPlan;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '갱신 가능한 필드가 없습니다.' }, { status: 400 });
    }

    const updated = await updateTask(id, (current) => ({ ...current, ...patch }));
    await writeTaskMarkdown(id, updated);
    return NextResponse.json(updated);
  } catch (err) {
    logger.error('TASKS', `PUT /api/tasks/${id} 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('TASKS', `DELETE /api/tasks/${id} 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
