'use client';

import { Message, ToolCallInfo } from '@/types/message';

interface ToolLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
}

export default function ToolLogPanel({ isOpen, onClose, messages }: ToolLogPanelProps) {
  if (!isOpen) return null;

  const allToolCalls: (ToolCallInfo & { messageId: string })[] = [];
  for (const msg of messages) {
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        allToolCalls.push({ ...tc, messageId: msg.id });
      }
    }
  }

  const totalDuration = allToolCalls
    .filter((tc) => tc.endTime && tc.startTime)
    .reduce((sum, tc) => sum + ((tc.endTime || 0) - tc.startTime), 0);

  const successCount = allToolCalls.filter((tc) => tc.success).length;
  const failCount = allToolCalls.filter((tc) => tc.success === false).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full md:max-w-md bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">도구 실행 로그</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>

          <div className="flex gap-3 mb-4 text-xs">
            <span className="text-muted">총 {allToolCalls.length}회</span>
            <span className="text-success">{successCount} 성공</span>
            {failCount > 0 && <span className="text-error">{failCount} 실패</span>}
            {totalDuration > 0 && (
              <span className="text-muted">{(totalDuration / 1000).toFixed(1)}초</span>
            )}
          </div>

          {allToolCalls.length === 0 ? (
            <div className="text-center text-muted text-sm py-8">
              도구 실행 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {allToolCalls.map((tc, i) => {
                const duration = tc.endTime ? ((tc.endTime - tc.startTime) / 1000).toFixed(1) : '...';
                return (
                  <div key={`${tc.id}-${i}`} className="bg-card rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-medium">{tc.tool}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">{duration}s</span>
                        <span className={`w-2 h-2 rounded-full ${
                          tc.success === true ? 'bg-success' :
                          tc.success === false ? 'bg-error' :
                          'bg-warning animate-pulse'
                        }`} />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted font-mono truncate">
                      {JSON.stringify(tc.input).slice(0, 100)}
                    </div>
                    {tc.output && (
                      <div className="mt-1 text-[11px] text-muted/70 font-mono line-clamp-2 break-all">
                        {tc.output.slice(0, 200)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
