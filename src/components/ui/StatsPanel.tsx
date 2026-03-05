'use client';

import { useState, useEffect, useCallback } from 'react';

interface Stats {
  totalConversations: number;
  totalMessages: number;
  pinnedCount: number;
  memoryCount: number;
  tagCounts: Record<string, number>;
  dailyActivity: Record<string, number>;
}

interface StatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StatsPanel({ isOpen, onClose }: StatsPanelProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/stats');
      const data = await r.json();
      setStats(data);
    } catch (err) {
      console.error('[fetchStats]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchStats();
  }, [isOpen, fetchStats]);

  if (!isOpen) return null;

  const topTags = stats
    ? Object.entries(stats.tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const activityData = stats ? Object.entries(stats.dailyActivity) : [];
  const maxActivity = Math.max(...activityData.map(([, v]) => v), 1);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] bg-background border border-border rounded-2xl z-50 max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">통계</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>

          {loading ? (
            <div className="text-center text-muted py-8">로딩 중...</div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '총 대화', value: stats.totalConversations },
                  { label: '총 메시지', value: stats.totalMessages },
                  { label: '고정 대화', value: stats.pinnedCount },
                  { label: '저장된 기억', value: stats.memoryCount },
                ].map((item) => (
                  <div key={item.label} className="bg-card rounded-xl p-3 border border-border">
                    <div className="text-[11px] text-muted">{item.label}</div>
                    <div className="text-xl font-semibold mt-1">{item.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Activity chart (last 7 days) */}
              <div>
                <h3 className="text-sm font-medium mb-3">최근 7일 활동</h3>
                <div className="flex items-end gap-1 h-24">
                  {activityData.map(([date, count]) => (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-accent/70 rounded-t min-h-[2px] transition-all"
                        style={{ height: `${(count / maxActivity) * 100}%` }}
                      />
                      <span className="text-[9px] text-muted">{date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top tags */}
              {topTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">인기 태그</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {topTags.map(([tag, count]) => (
                      <span key={tag} className="px-2 py-0.5 text-xs bg-card border border-border rounded-full">
                        #{tag} <span className="text-muted">({count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
