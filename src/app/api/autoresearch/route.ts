import { NextRequest, NextResponse } from 'next/server';
import {
  runExperimentLoop,
  getRunningExperiment,
  stopExperiment,
} from '@/lib/autoresearch/experiment-runner';
import { ExperimentConfig } from '@/lib/autoresearch/types';

/**
 * GET /api/autoresearch — 현재 실험 상태 조회
 */
export async function GET() {
  const status = getRunningExperiment();
  return NextResponse.json(status);
}

/**
 * POST /api/autoresearch — 실험 루프 시작 (SSE 스트림)
 * Body: { maxExperiments?, improvementThreshold?, caseIds?, strategyIds? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const config: ExperimentConfig = {
    maxExperiments: body.maxExperiments ?? 20,
    improvementThreshold: body.improvementThreshold ?? 0.5,
    caseIds: body.caseIds,
    strategyIds: body.strategyIds,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const progress of runExperimentLoop(config)) {
          const data = JSON.stringify(progress);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (err) {
        const errorData = JSON.stringify({
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'Unknown error' },
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * DELETE /api/autoresearch — 실행 중인 실험 중단
 */
export async function DELETE() {
  const stopped = stopExperiment();
  return NextResponse.json({ stopped });
}
