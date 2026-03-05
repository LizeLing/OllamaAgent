'use client';

import { useState } from 'react';
import { PROMPT_TEMPLATES } from '@/lib/presets/prompt-templates';

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SystemPromptEditor({ value, onChange }: SystemPromptEditorProps) {
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showTemplates ? '닫기' : '템플릿 선택'}
        </button>
      </div>

      {showTemplates && (
        <div className="mb-2 grid grid-cols-1 gap-1.5">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onChange(t.prompt);
                setShowTemplates(false);
              }}
              className="text-left p-2 bg-card hover:bg-card-hover border border-border rounded-lg transition-colors"
            >
              <div className="text-xs font-medium text-foreground">{t.name}</div>
              <div className="text-[11px] text-muted">{t.description}</div>
            </button>
          ))}
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-jetbrains)] resize-y focus:outline-none focus:border-accent"
        placeholder="시스템 프롬프트를 입력하세요..."
      />
    </div>
  );
}
