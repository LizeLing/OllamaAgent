'use client';

import { useState } from 'react';
import HtmlPreview from './HtmlPreview';

const RUNNABLE_LANGUAGES = new Set(['python', 'javascript', 'typescript', 'bash', 'sh']);
const PREVIEWABLE_LANGUAGES = new Set(['html']);

interface CodeActionsProps {
  language: string;
  code: string;
}

export default function CodeActions({ language, code }: CodeActionsProps) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const canRun = RUNNABLE_LANGUAGES.has(language);
  const canPreview = PREVIEWABLE_LANGUAGES.has(language);

  if (!canRun && !canPreview) return null;

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    setIsError(false);
    try {
      const res = await fetch('/api/code-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code }),
      });
      const data = await res.json();
      if (data.success) {
        setOutput(data.output);
        setIsError(false);
      } else {
        setOutput(data.error || data.output || 'Execution failed');
        setIsError(true);
      }
    } catch (err) {
      setOutput(err instanceof Error ? err.message : 'Failed to execute');
      setIsError(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 mt-1.5">
        {canRun && (
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-500/15 text-emerald-400 rounded-md hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                </svg>
                실행 중...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </>
            )}
          </button>
        )}
        {canPreview && (
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-500/15 text-blue-400 rounded-md hover:bg-blue-500/25 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Preview
          </button>
        )}
      </div>

      {output !== null && (
        <pre
          className={`mt-1.5 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-60 ${
            isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
          }`}
        >
          {output}
        </pre>
      )}

      {showPreview && (
        <HtmlPreview html={code} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}
