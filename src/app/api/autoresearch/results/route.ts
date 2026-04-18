import { NextResponse } from 'next/server';
import { loadResults, clearResults } from '@/lib/autoresearch/results-store';

/**
 * GET /api/autoresearch/results — 실험 결과 목록
 */
export async function GET() {
  const results = await loadResults();

  // 요약 통계
  const summary = {
    totalExperiments: results.length,
    kept: results.filter((r) => r.status === 'keep').length,
    discarded: results.filter((r) => r.status === 'discard').length,
    crashed: results.filter((r) => r.status === 'crash').length,
    baselineScore: results.find((r) => r.status === 'baseline')?.metrics.overallScore ?? 0,
    bestScore: Math.max(...results.map((r) => r.metrics.overallScore), 0),
    latestScore: results.length > 0 ? results[results.length - 1].metrics.overallScore : 0,
  };

  return NextResponse.json({ summary, results });
}

/**
 * DELETE /api/autoresearch/results — 결과 초기화
 */
export async function DELETE() {
  await clearResults();
  return NextResponse.json({ cleared: true });
}
