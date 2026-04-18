import { NextRequest, NextResponse } from 'next/server';
import { runBenchmark } from '@/lib/autoresearch/benchmark';
import { DEFAULT_BENCHMARK_CASES } from '@/lib/autoresearch/default-cases';

/**
 * GET /api/autoresearch/benchmark — 벤치마크 케이스 목록
 */
export async function GET() {
  return NextResponse.json({
    cases: DEFAULT_BENCHMARK_CASES.map((c) => ({
      id: c.id,
      category: c.category,
      query: c.query,
      weight: c.weight,
      disableTools: c.disableTools ?? false,
    })),
  });
}

/**
 * POST /api/autoresearch/benchmark — 단일 벤치마크 실행
 * Body: { caseIds?: string[], configOverrides?: {} }
 * 전체 실험 루프 없이 현재 설정으로 벤치마크만 실행
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await runBenchmark(
      body.configOverrides,
      body.caseIds
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Benchmark failed' },
      { status: 500 }
    );
  }
}
