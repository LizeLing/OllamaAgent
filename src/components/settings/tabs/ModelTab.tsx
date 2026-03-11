'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings } from '@/types/settings';
import ModelOptionsSliders from '../ModelOptionsSliders';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface LoadedModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at: string;
  details: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

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
  loadedModels: '현재 Ollama 메모리에 로드된 모델입니다.\n\n미리 로드하면 첫 응답이 빨라집니다.',
  thinkingMode: '모델의 Thinking(추론 과정 표시) 동작을 제어합니다.\n\nAuto: 최종 응답에만 Thinking 사용\nOn: 항상 Thinking 사용\nOff: Thinking 비활성화',
  numParallel: '하나의 모델이 동시에 처리할 수 있는 요청 수입니다.\n\n값이 클수록 동시 요청을 더 많이 처리하지만 VRAM 사용량이 증가합니다.\n\n기본값: 1',
  maxLoadedModels: 'VRAM에 동시에 로드할 수 있는 최대 모델 수입니다.\n\n여러 모델을 동시에 사용할 때 유용합니다.\n\n기본값: 1',
};

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
const selectClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

function formatSize(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

export default function ModelTab({ draft, onDraftChange }: ModelTabProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loadedModels, setLoadedModels] = useState<LoadedModel[]>([]);
  const [modelInfo, setModelInfo] = useState<Record<string, { contextLength: number }>>({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchModels = useCallback(() => {
    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        setLoadedModels(data.loaded || []);
        setModelInfo(data.modelInfo || {});
      })
      .catch(() => { setModels([]); setLoadedModels([]); })
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleModelAction = async (model: string, action: 'load' | 'unload') => {
    setActionInProgress(model);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, action }),
      });
      if (res.ok) {
        // Refresh after a short delay for Ollama to update
        setTimeout(fetchModels, 500);
      }
    } catch {
      // ignore
    } finally {
      setActionInProgress(null);
    }
  };

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

      {/* Loaded Models */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Loaded Models</label>
            <HelpTooltip text={HELP.loadedModels} />
          </div>
          <button
            onClick={fetchModels}
            disabled={loadingModels}
            className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
          >
            {loadingModels ? '...' : '새로고침'}
          </button>
        </div>

        {loadedModels.length > 0 ? (
          <div className="space-y-1.5 mb-3">
            {loadedModels.map((lm) => (
              <div key={lm.name} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{lm.name}</div>
                  <div className="text-[10px] text-muted">
                    {lm.details.parameter_size && <span>{lm.details.parameter_size}</span>}
                    {lm.details.quantization_level && <span> · {lm.details.quantization_level}</span>}
                    <span> · VRAM {formatSize(lm.size_vram)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleModelAction(lm.name, 'unload')}
                  disabled={actionInProgress === lm.name}
                  className="text-xs text-error hover:text-red-400 disabled:opacity-50 shrink-0"
                >
                  {actionInProgress === lm.name ? '...' : '언로드'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted mb-3">로드된 모델이 없습니다.</p>
        )}

        {models.length > 0 && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                id="load-model-select"
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>모델 선택...</option>
                {models
                  .filter((m) => !loadedModels.some((lm) => lm.name === m))
                  .map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
              </div>
            </div>
            <button
              onClick={() => {
                const sel = document.getElementById('load-model-select') as HTMLSelectElement;
                if (sel?.value) handleModelAction(sel.value, 'load');
              }}
              disabled={!!actionInProgress}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 shrink-0"
            >
              {actionInProgress ? '로딩...' : '로드'}
            </button>
          </div>
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
          maxContextLength={draft.ollamaModel ? modelInfo[draft.ollamaModel]?.contextLength : undefined}
        />
      </section>

      <hr className="border-border" />

      {/* Thinking Mode */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Thinking Mode</h3>
          <HelpTooltip text={HELP.thinkingMode} />
        </div>
        <div className="space-y-2">
          {([
            { value: 'auto', label: 'Auto — 최종 응답에만 Thinking' },
            { value: 'on', label: 'On — 항상 Thinking 사용' },
            { value: 'off', label: 'Off — Thinking 비활성화' },
          ] as { value: 'off' | 'on' | 'auto'; label: string }[]).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="thinkingMode"
                value={opt.value}
                checked={(draft.thinkingMode || 'auto') === opt.value}
                onChange={() => onDraftChange({ thinkingMode: opt.value })}
                className="accent-accent"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
        {(draft.thinkingMode || 'auto') === 'on' && (
          <label className="flex items-center gap-2 mt-3 ml-5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.thinkingForToolCalls ?? false}
              onChange={(e) => onDraftChange({ thinkingForToolCalls: e.target.checked })}
              className="accent-accent"
            />
            <span className="text-sm text-muted">도구 호출 시에도 Thinking 사용</span>
          </label>
        )}
      </section>

      <hr className="border-border" />

      {/* Parallel Processing */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">병렬 처리</h3>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm text-muted">동시 요청 수 (OLLAMA_NUM_PARALLEL)</label>
              <HelpTooltip text={HELP.numParallel} />
            </div>
            <input
              type="number"
              min={1}
              max={8}
              value={draft.numParallel || 1}
              onChange={(e) => onDraftChange({ numParallel: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })}
              className="w-24 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm text-muted">최대 로드 모델 수 (OLLAMA_MAX_LOADED_MODELS)</label>
              <HelpTooltip text={HELP.maxLoadedModels} />
            </div>
            <input
              type="number"
              min={1}
              max={4}
              value={draft.maxLoadedModels || 1}
              onChange={(e) => onDraftChange({ maxLoadedModels: Math.max(1, Math.min(4, parseInt(e.target.value) || 1)) })}
              className="w-24 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="pt-1">
            <p className="text-xs text-yellow-500 mb-2">변경 사항을 적용하려면 Ollama를 재시작해야 합니다. 진행 중인 요청이 중단됩니다.</p>
            <button
              onClick={async () => {
                setRestarting(true);
                setRestartResult(null);
                try {
                  const res = await fetch('/api/ollama/restart', { method: 'POST' });
                  const data = await res.json();
                  if (res.ok) {
                    setRestartResult({ ok: true, message: `Ollama 재시작 완료 (NUM_PARALLEL=${data.numParallel}, MAX_LOADED_MODELS=${data.maxLoadedModels})` });
                    setTimeout(fetchModels, 1000);
                  } else {
                    setRestartResult({ ok: false, message: data.error || '재시작 실패' });
                  }
                } catch {
                  setRestartResult({ ok: false, message: 'Ollama 재시작 요청 실패' });
                } finally {
                  setRestarting(false);
                }
              }}
              disabled={restarting}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
            >
              {restarting ? 'Ollama 재시작 중...' : 'Ollama 재시작'}
            </button>
            {restartResult && (
              <p className={`text-xs mt-2 ${restartResult.ok ? 'text-green-500' : 'text-error'}`}>
                {restartResult.message}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
