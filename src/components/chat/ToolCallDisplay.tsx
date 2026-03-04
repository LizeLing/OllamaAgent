'use client';

import { ToolCallInfo } from '@/types/message';
import { useState } from 'react';

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export default function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = toolCall.endTime === undefined;

  return (
    <div
      className={`border rounded-lg text-xs ${
        isRunning
          ? 'border-accent tool-running'
          : toolCall.success
          ? 'border-border'
          : 'border-error/50'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover rounded-lg transition-colors"
      >
        <span className="text-base">
          {isRunning ? '⏳' : toolCall.success ? '✅' : '❌'}
        </span>
        <span className="font-medium font-[family-name:var(--font-jetbrains)]">
          {toolCall.tool}
        </span>
        {toolCall.endTime && (
          <span className="text-muted ml-auto">
            {toolCall.endTime - toolCall.startTime}ms
          </span>
        )}
        <svg
          className={`w-3 h-3 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          <div>
            <span className="text-muted">Input:</span>
            <pre className="mt-1 p-2 bg-[#111] rounded text-[11px] overflow-x-auto font-[family-name:var(--font-jetbrains)]">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output !== undefined && (
            <div>
              <span className="text-muted">Output:</span>
              <pre className="mt-1 p-2 bg-[#111] rounded text-[11px] overflow-x-auto max-h-48 font-[family-name:var(--font-jetbrains)]">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
