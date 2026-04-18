import { NextRequest, NextResponse } from 'next/server';
import { buildResumeContext, type ResumeOptions } from '@/lib/tasks/context-builder';
import { readTask } from '@/lib/tasks/storage';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';
import { logger, getErrorMessage } from '@/lib/logger';

interface ResumeRequestBody {
  checkpointId?: string;
  includeRecentRun?: boolean;
  includeMemory?: boolean;
  includeKnowledge?: boolean;
  topK?: number;
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  return fallback;
}

/**
 * POST /api/tasks/[id]/resume
 * Body (선택): { checkpointId?, includeRecentRun?, includeMemory?, includeKnowledge?, topK? }
 * 또는 쿼리 파라미터: ?memory=1&knowledge=1&run=1
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

    const body = (await request.json().catch(() => ({}))) as ResumeRequestBody;
    const qs = new URL(request.url).searchParams;

    const checkpointId =
      typeof body.checkpointId === 'string' && body.checkpointId.length > 0
        ? body.checkpointId
        : undefined;
    const includeRecentRun = parseBool(body.includeRecentRun ?? qs.get('run'), false);
    const includeMemory = parseBool(body.includeMemory ?? qs.get('memory'), false);
    const includeKnowledge = parseBool(body.includeKnowledge ?? qs.get('knowledge'), false);
    const topK = parseNumber(body.topK, 3);

    const options: ResumeOptions = {
      includeRecentRun,
      topK,
      ...(checkpointId !== undefined && { checkpointId }),
    };

    if (includeMemory || includeKnowledge) {
      const settings = await loadSettings();
      const ollamaUrl = settings.ollamaUrl;
      if (includeMemory && settings.embeddingModel) {
        const memoryManager = new MemoryManager(
          ollamaUrl,
          settings.embeddingModel,
          settings.memoryCategories,
        );
        options.memorySearch = (q, k) => memoryManager.searchMemories(q, k);
      }
      if (includeKnowledge && settings.embeddingModel) {
        const knowledgeManager = new KnowledgeManager(ollamaUrl, settings.embeddingModel);
        options.knowledgeSearch = async (q, k) => {
          const results = await knowledgeManager.search(q, k);
          return results.map((r) => ({ text: r.text, source: r.source || r.filename }));
        };
      }
    }

    const context = await buildResumeContext(id, options);
    return NextResponse.json(context);
  } catch (err) {
    logger.error('TASKS', `POST /api/tasks/${id}/resume 실패`, err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
