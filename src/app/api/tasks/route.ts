import { NextRequest, NextResponse } from 'next/server';
import {
  listTasks,
  createTask,
  ensureTaskDirectories,
} from '@/lib/tasks/storage';
import { writeTaskMarkdown } from '@/lib/tasks/markdown';
import { runBreakdown, type BreakdownInput } from '@/lib/tasks/breakdown-engine';
import { loadSettings } from '@/lib/config/settings';
import { logger, getErrorMessage } from '@/lib/logger';
import type { AgentConfig } from '@/lib/agent/types';

export async function GET() {
  try {
    const tasks = await listTasks();
    return NextResponse.json(tasks);
  } catch (err) {
    logger.error('TASKS', 'listTasks 실패', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
    }

    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    if (!goal) {
      return NextResponse.json({ error: "'goal' 필드가 필요합니다." }, { status: 400 });
    }

    const input: BreakdownInput = {
      goal,
      title: typeof body.title === 'string' ? body.title.trim() || undefined : undefined,
      source: body.source,
      constraints: Array.isArray(body.constraints) ? body.constraints.filter((c: unknown) => typeof c === 'string') : undefined,
      contextFiles: Array.isArray(body.contextFiles)
        ? body.contextFiles.filter((f: unknown) => f && typeof f === 'object' && typeof (f as Record<string, unknown>).path === 'string')
        : undefined,
    };

    const settings = await loadSettings();
    const agentConfig: AgentConfig = {
      ollamaUrl: settings.ollamaUrl,
      ollamaModel: typeof body.model === 'string' && body.model ? body.model : settings.ollamaModel,
      maxIterations: settings.maxIterations,
      systemPrompt: '',
      allowedPaths: settings.allowedPaths,
      deniedPaths: settings.deniedPaths,
      modelOptions: settings.modelOptions
        ? {
            temperature: settings.modelOptions.temperature,
            top_p: settings.modelOptions.topP,
            num_predict: settings.modelOptions.numPredict,
          }
        : undefined,
      fallbackModels: settings.fallbackModels || [],
    };

    const record = await runBreakdown(input, agentConfig);

    await ensureTaskDirectories(record.id);
    await createTask(record);
    await writeTaskMarkdown(record.id, record);

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logger.error('TASKS', 'POST /api/tasks 실패', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
