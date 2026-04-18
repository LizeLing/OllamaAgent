import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/handler';
import { AppError } from '@/lib/errors';
import { bootstrapTaskMode } from '@/lib/tasks/bootstrap';
import { TaskBootstrapOptions, TaskWorkloadType } from '@/types/task';

const VALID_WORKLOAD_TYPES = new Set<TaskWorkloadType>([
  'main-agent',
  'worker-agent',
  'mixed-task-mode',
]);

function parseBootstrapOptions(body: unknown): TaskBootstrapOptions {
  if (body == null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Invalid request body.', 400, 'INVALID_TASK_BOOTSTRAP');
  }

  const input = body as Record<string, unknown>;
  const options: TaskBootstrapOptions = {};

  if (input.model !== undefined) {
    if (typeof input.model !== 'string' || input.model.trim().length === 0) {
      throw new AppError('model must be a non-empty string.', 400, 'INVALID_TASK_BOOTSTRAP');
    }
    options.model = input.model.trim();
  }

  if (input.numCtx !== undefined) {
    if (!Number.isInteger(input.numCtx) || Number(input.numCtx) <= 0) {
      throw new AppError('numCtx must be a positive integer.', 400, 'INVALID_TASK_BOOTSTRAP');
    }
    options.numCtx = Number(input.numCtx);
  }

  if (input.workloadType !== undefined) {
    if (
      typeof input.workloadType !== 'string' ||
      !VALID_WORKLOAD_TYPES.has(input.workloadType as TaskWorkloadType)
    ) {
      throw new AppError(
        'workloadType must be one of main-agent, worker-agent, mixed-task-mode.',
        400,
        'INVALID_TASK_BOOTSTRAP'
      );
    }
    options.workloadType = input.workloadType as TaskWorkloadType;
  }

  if (input.includeImageModel !== undefined) {
    if (typeof input.includeImageModel !== 'boolean') {
      throw new AppError(
        'includeImageModel must be a boolean.',
        400,
        'INVALID_TASK_BOOTSTRAP'
      );
    }
    options.includeImageModel = input.includeImageModel;
  }

  return options;
}

export const POST = withErrorHandler('TASK_BOOTSTRAP', async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const options = parseBootstrapOptions(body);
  const result = await bootstrapTaskMode(options);
  return NextResponse.json(result);
});
