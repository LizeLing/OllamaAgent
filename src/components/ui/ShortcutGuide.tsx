'use client';

interface ShortcutGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Esc'], description: '응답 생성 중단' },
  { keys: ['Cmd', ','], description: '설정 열기/닫기' },
  { keys: ['Cmd', 'Shift', 'N'], description: '새 대화' },
  { keys: ['Enter'], description: '메시지 전송' },
  { keys: ['Shift', 'Enter'], description: '줄바꿈' },
  { keys: ['?'], description: '단축키 가이드' },
];

export default function ShortcutGuide({ isOpen, onClose }: ShortcutGuideProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="shortcut-guide-title" onClick={onClose}>
        <div
          className="bg-background border border-border rounded-2xl shadow-xl w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 id="shortcut-guide-title" className="text-base font-semibold">키보드 단축키</h3>
            <button onClick={onClose} aria-label="닫기" className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>
          <div className="space-y-3">
            {SHORTCUTS.map((s) => (
              <div key={s.description} className="flex items-center justify-between">
                <span className="text-sm text-muted">{s.description}</span>
                <div className="flex gap-1">
                  {s.keys.map((key) => (
                    <kbd
                      key={key}
                      className="px-2 py-0.5 text-xs font-mono bg-card border border-border rounded text-foreground"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-4 text-center">
            Mac: Cmd / Windows: Ctrl
          </p>
        </div>
      </div>
    </>
  );
}
