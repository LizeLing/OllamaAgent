'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import ModelOptionsSliders from '../ModelOptionsSliders';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface ModelTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

const HELP = {
  ollamaUrl: 'Ollama API 서버의 URL입니다.\n\n기본값: http://localhost:11434',
  model: '응답 생성에 사용할 AI 모델입니다.',
  fallbackModels: '기본 모델 실패 시 순서대로 시도할 대체 모델 목록입니다.',
  maxIterations: '에이전트가 도구를 연속 호출할 수 있는 최대 반복 횟수입니다.\n\n권장: 10',
  modelOptions: '모델의 응답 생성 방식을 제어하는 파라미터입니다.',
};

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
const selectClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

export default function ModelTab({ draft, onDraftChange }: ModelTabProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* Ollama URL */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">Ollama URL</label>
          <HelpTooltip text={HELP.ollamaUrl} />
        </div>
        <input
          value={draft.ollamaUrl || ''}
          onChange={(e) => onDraftChange({ ollamaUrl: e.target.value })}
          className={inputClass}
        />
      </section>

      <hr className="border-border" />

      {/* Model */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">Model</label>
          <HelpTooltip text={HELP.model} />
        </div>
        {loadingModels ? (
          <div className="text-sm text-muted py-1.5">Loading models...</div>
        ) : models.length > 0 ? (
          <div className="relative">
            <select
              value={draft.ollamaModel || ''}
              onChange={(e) => onDraftChange({ ollamaModel: e.target.value })}
              className={selectClass}
            >
              {!models.includes(draft.ollamaModel || '') && draft.ollamaModel && (
                <option value={draft.ollamaModel}>{draft.ollamaModel}</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
            </div>
          </div>
        ) : (
          <input
            value={draft.ollamaModel || ''}
            onChange={(e) => onDraftChange({ ollamaModel: e.target.value })}
            className={inputClass}
            placeholder="e.g. qwen3.5:9b"
          />
        )}
      </section>

      <hr className="border-border" />

      {/* Fallback Models */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">Fallback 모델</label>
          <HelpTooltip text={HELP.fallbackModels} />
        </div>
        <p className="text-xs text-muted mb-2">기본 모델 실패 시 순서대로 시도됩니다.</p>
        {(draft.fallbackModels || []).length > 0 && (
          <div className="space-y-1 mb-2">
            {(draft.fallbackModels || []).map((fm, i) => (
              <div key={i} className="flex items-center gap-2 bg-card rounded-lg px-3 py-1.5">
                <span className="text-xs text-muted w-4">{i + 1}</span>
                <span className="flex-1 text-sm">{fm}</span>
                <button
                  onClick={() => {
                    const arr = [...(draft.fallbackModels || [])];
                    if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }
                    onDraftChange({ fallbackModels: arr });
                  }}
                  disabled={i === 0}
                  className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                  title="위로"
                >&#9650;</button>
                <button
                  onClick={() => {
                    const arr = [...(draft.fallbackModels || [])];
                    if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
                    onDraftChange({ fallbackModels: arr });
                  }}
                  disabled={i === (draft.fallbackModels || []).length - 1}
                  className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                  title="아래로"
                >&#9660;</button>
                <button
                  onClick={() => {
                    onDraftChange({ fallbackModels: (draft.fallbackModels || []).filter((_, idx) => idx !== i) });
                  }}
                  className="text-error hover:text-red-400 text-xs"
                  title="삭제"
                >&#10005;</button>
              </div>
            ))}
          </div>
        )}
        {models.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value && !(draft.fallbackModels || []).includes(e.target.value)) {
                onDraftChange({ fallbackModels: [...(draft.fallbackModels || []), e.target.value] });
              }
            }}
            className={selectClass}
          >
            <option value="">+ 모델 추가...</option>
            {models
              .filter((m) => m !== draft.ollamaModel && !(draft.fallbackModels || []).includes(m))
              .map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
          </select>
        )}
      </section>

      <hr className="border-border" />

      {/* Max Iterations */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">Max Iterations</label>
          <HelpTooltip text={HELP.maxIterations} />
        </div>
        <input
          type="number"
          min={1}
          max={50}
          value={draft.maxIterations || 10}
          onChange={(e) => onDraftChange({ maxIterations: parseInt(e.target.value) || 10 })}
          className="w-24 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
      </section>

      <hr className="border-border" />

      {/* Model Parameters */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">모델 파라미터</h3>
          <HelpTooltip text={HELP.modelOptions} />
        </div>
        <ModelOptionsSliders
          options={draft.modelOptions || { temperature: 0.7, topP: 0.9, numPredict: 2048 }}
          onChange={(modelOptions) => onDraftChange({ modelOptions })}
        />
      </section>
    </div>
  );
}
