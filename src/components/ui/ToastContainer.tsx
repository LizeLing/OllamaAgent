'use client';

import { useToast, removeToast } from '@/hooks/useToast';

const STYLES = {
  error: 'bg-red-950/95 border-red-800 text-red-200',
  warning: 'bg-amber-950/95 border-amber-800 text-amber-200',
  info: 'bg-blue-950/95 border-blue-800 text-blue-200',
};

const ICONS = { error: '\u26A0', warning: '\u26A1', info: '\u2139' };

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg ${STYLES[toast.type]}`}
        >
          <span className="shrink-0">{ICONS[toast.type]}</span>
          <p className="text-sm flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="opacity-60 hover:opacity-100 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
