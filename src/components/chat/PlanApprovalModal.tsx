'use client';

import { useState } from 'react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';

interface PlanApprovalModalProps {
  plan: string;
  blockedTools?: string[];
  onApprove: () => void;
  onReviseRequest: (feedback: string) => void;
  onCancel: () => void;
}

export default function PlanApprovalModal({
  plan,
  blockedTools,
  onApprove,
  onReviseRequest,
  onCancel,
}: PlanApprovalModalProps) {
  const [mode, setMode] = useState<'view' | 'revise'>('view');
  const [feedback, setFeedback] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Plan 승인 모달"
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">실행 계획 승인</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-muted hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs text-muted">
            아래 계획을 검토하고 승인 여부를 선택하세요. 승인 시 동일 요청이 실행 모드로 재전송됩니다.
          </p>

          {blockedTools && blockedTools.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              <p className="font-medium text-warning mb-1">차단된 도구 호출 감지</p>
              <p className="text-foreground/80">
                {blockedTools.join(', ')} — Plan 모드 중 차단되었습니다.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-background p-4 text-sm">
            <MarkdownRenderer content={plan} />
          </div>

          {mode === 'revise' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">수정 요청 사항</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="계획을 어떻게 수정해야 할지 구체적으로 작성하세요..."
                className="w-full resize-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          {mode === 'view' ? (
            <>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setMode('revise')}
                className="px-4 py-2 text-sm bg-card-hover text-foreground rounded-lg hover:bg-card-active transition-colors"
              >
                수정 요청
              </button>
              <button
                onClick={onApprove}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                승인하고 실행
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setFeedback('');
                  setMode('view');
                }}
                className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                뒤로
              </button>
              <button
                onClick={() => {
                  const trimmed = feedback.trim();
                  if (!trimmed) return;
                  onReviseRequest(trimmed);
                }}
                disabled={!feedback.trim()}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                수정 요청 전송
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
