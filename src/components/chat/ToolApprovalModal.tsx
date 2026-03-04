'use client';

interface ToolApprovalModalProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  confirmId: string;
  onRespond: (confirmId: string, approved: boolean) => void;
}

export default function ToolApprovalModal({ toolName, toolInput, confirmId, onRespond }: ToolApprovalModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-base font-semibold mb-2">도구 실행 승인</h3>
        <p className="text-sm text-muted mb-3">다음 도구를 실행하시겠습니까?</p>
        <div className="bg-card rounded-lg p-3 mb-4">
          <p className="text-sm font-mono text-accent">{toolName}</p>
          <pre className="text-xs text-muted mt-1 overflow-auto max-h-32">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onRespond(confirmId, true)}
            className="flex-1 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover"
          >
            승인
          </button>
          <button
            onClick={() => onRespond(confirmId, false)}
            className="flex-1 py-2 bg-card text-muted rounded-lg text-sm hover:bg-card-hover hover:text-foreground"
          >
            거부
          </button>
        </div>
      </div>
    </div>
  );
}
