'use client';

import { useEffect, useRef, useCallback } from 'react';

interface ToolApprovalModalProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  confirmId: string;
  onRespond: (confirmId: string, approved: boolean) => void;
}

export default function ToolApprovalModal({ toolName, toolInput, confirmId, onRespond }: ToolApprovalModalProps) {
  const approveRef = useRef<HTMLButtonElement>(null);
  const denyRef = useRef<HTMLButtonElement>(null);

  // 포커스 트랩: 모달 열릴 때 승인 버튼에 포커스
  useEffect(() => {
    approveRef.current?.focus();
  }, []);

  // ESC 키로 거부 + Tab 포커스 트랩
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onRespond(confirmId, false);
      return;
    }
    // 포커스 트랩: Tab 키가 모달 내부에서만 순환
    if (e.key === 'Tab') {
      const focusable = [approveRef.current, denyRef.current].filter(Boolean) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [confirmId, onRespond]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-approval-title"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4">
        <h3 id="tool-approval-title" className="text-base font-semibold mb-2">도구 실행 승인</h3>
        <p className="text-sm text-muted mb-3">다음 도구를 실행하시겠습니까?</p>
        <div className="bg-card rounded-lg p-3 mb-4">
          <p className="text-sm font-mono text-accent">{toolName}</p>
          <pre className="text-xs text-muted mt-1 overflow-auto max-h-32">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            ref={approveRef}
            onClick={() => onRespond(confirmId, true)}
            aria-label={`도구 ${toolName} 실행 승인`}
            className="flex-1 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover"
          >
            승인
          </button>
          <button
            ref={denyRef}
            onClick={() => onRespond(confirmId, false)}
            aria-label={`도구 ${toolName} 실행 거부`}
            className="flex-1 py-2 bg-card text-muted rounded-lg text-sm hover:bg-card-hover hover:text-foreground"
          >
            거부
          </button>
        </div>
      </div>
    </div>
  );
}
