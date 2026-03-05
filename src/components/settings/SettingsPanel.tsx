'use client';

import { useState, useEffect } from 'react';
import { Settings, ToolApprovalMode } from '@/types/settings';
import { addToast } from '@/hooks/useToast';
import SystemPromptEditor from './SystemPromptEditor';
import PathConfigEditor from './PathConfigEditor';
import PresetSelector from './PresetSelector';
import CustomToolEditor from './CustomToolEditor';
import McpServerManager from './McpServerManager';
import ModelOptionsSliders from './ModelOptionsSliders';

interface Voice {
  name: string;
  locale: string;
  gender: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings | null;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}

export default function SettingsPanel({ isOpen, onClose, settings, onSave }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [webhookKeys, setWebhookKeys] = useState<Array<{id: string; name: string; keyPrefix: string; createdAt: number; lastUsedAt?: number}>>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));

    setLoadingVoices(true);
    fetch('/api/voices')
      .then((r) => r.json())
      .then((data) => setVoices(data.voices || []))
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));

    fetch('/api/webhooks/keys')
      .then((r) => r.json())
      .then((data) => setWebhookKeys(Array.isArray(data) ? data : []))
      .catch(() => setWebhookKeys([]));
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  };

  if (!isOpen || !settings) return null;

  const selectClass =
    'w-full bg-[#111] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';
  const inputClass =
    'w-full bg-[#111] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  // Group voices by locale
  const voicesByLocale = voices.reduce<Record<string, Voice[]>>((acc, v) => {
    (acc[v.locale] ||= []).push(v);
    return acc;
  }, {});
  const sortedLocales = Object.keys(voicesByLocale).sort((a, b) => {
    // Korean first, then English, then others alphabetically
    if (a.startsWith('ko')) return -1;
    if (b.startsWith('ko')) return 1;
    if (a.startsWith('en')) return -1;
    if (b.startsWith('en')) return 1;
    return a.localeCompare(b);
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:max-w-md bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6 safe-bottom">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">
              &times;
            </button>
          </div>

          <div className="space-y-6">
            <PresetSelector
              activePresetId={draft.activePresetId}
              onSelect={(updates) => setDraft({ ...draft, ...updates })}
            />

            {/* Tool Approval Mode */}
            <div>
              <label className="block text-sm font-medium mb-2">도구 승인 모드</label>
              <div className="space-y-2">
                {([
                  { value: 'auto', label: '모든 도구 자동 실행' },
                  { value: 'confirm', label: '모든 도구 실행 전 확인' },
                  { value: 'deny-dangerous', label: '위험한 도구만 확인' },
                ] as { value: ToolApprovalMode; label: string }[]).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="toolApprovalMode"
                      value={opt.value}
                      checked={(draft.toolApprovalMode || 'auto') === opt.value}
                      onChange={() => setDraft({ ...draft, toolApprovalMode: opt.value })}
                      className="accent-accent"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <SystemPromptEditor
              value={draft.systemPrompt || ''}
              onChange={(v) => setDraft({ ...draft, systemPrompt: v })}
            />

            <div>
              <label className="block text-sm font-medium mb-2">Max Iterations</label>
              <input
                type="number"
                min={1}
                max={50}
                value={draft.maxIterations || 10}
                onChange={(e) => setDraft({ ...draft, maxIterations: parseInt(e.target.value) || 10 })}
                className="w-24 bg-[#111] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Ollama URL</label>
              <input
                value={draft.ollamaUrl || ''}
                onChange={(e) => setDraft({ ...draft, ollamaUrl: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* Model Dropdown */}
            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              {loadingModels ? (
                <div className="text-sm text-muted py-1.5">Loading models...</div>
              ) : models.length > 0 ? (
                <div className="relative">
                  <select
                    value={draft.ollamaModel || ''}
                    onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })}
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
                  onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. qwen3.5:9b"
                />
              )}
            </div>

            {/* Fallback Models */}
            <div>
              <label className="block text-sm font-medium mb-2">Fallback 모델</label>
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
                          setDraft({ ...draft, fallbackModels: arr });
                        }}
                        disabled={i === 0}
                        className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                        title="위로"
                      >▲</button>
                      <button
                        onClick={() => {
                          const arr = [...(draft.fallbackModels || [])];
                          if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
                          setDraft({ ...draft, fallbackModels: arr });
                        }}
                        disabled={i === (draft.fallbackModels || []).length - 1}
                        className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                        title="아래로"
                      >▼</button>
                      <button
                        onClick={() => {
                          setDraft({ ...draft, fallbackModels: (draft.fallbackModels || []).filter((_, idx) => idx !== i) });
                        }}
                        className="text-error hover:text-red-400 text-xs"
                        title="삭제"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              {models.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !(draft.fallbackModels || []).includes(e.target.value)) {
                      setDraft({ ...draft, fallbackModels: [...(draft.fallbackModels || []), e.target.value] });
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
            </div>

            <ModelOptionsSliders
              options={draft.modelOptions || { temperature: 0.7, topP: 0.9, numPredict: 2048 }}
              onChange={(modelOptions) => setDraft({ ...draft, modelOptions })}
            />

            <div>
              <label className="block text-sm font-medium mb-2">SearXNG URL</label>
              <input
                value={draft.searxngUrl || ''}
                onChange={(e) => setDraft({ ...draft, searxngUrl: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* TTS Voice Dropdown */}
            <div>
              <label className="block text-sm font-medium mb-2">TTS Voice</label>
              {loadingVoices ? (
                <div className="text-sm text-muted py-1.5">Loading voices...</div>
              ) : voices.length > 0 ? (
                <div className="relative">
                  <select
                    value={draft.ttsVoice || ''}
                    onChange={(e) => setDraft({ ...draft, ttsVoice: e.target.value })}
                    className={selectClass}
                  >
                    {!voices.some((v) => v.name === draft.ttsVoice) && draft.ttsVoice && (
                      <option value={draft.ttsVoice}>{draft.ttsVoice}</option>
                    )}
                    {sortedLocales.map((locale) => (
                      <optgroup key={locale} label={locale}>
                        {voicesByLocale[locale].map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name} ({v.gender})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
                  </div>
                </div>
              ) : (
                <input
                  value={draft.ttsVoice || ''}
                  onChange={(e) => setDraft({ ...draft, ttsVoice: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. ko-KR-SunHiNeural"
                />
              )}
            </div>

            <PathConfigEditor
              label="Allowed Paths"
              paths={draft.allowedPaths || []}
              onChange={(paths) => setDraft({ ...draft, allowedPaths: paths })}
            />

            <PathConfigEditor
              label="Denied Paths"
              paths={draft.deniedPaths || []}
              onChange={(paths) => setDraft({ ...draft, deniedPaths: paths })}
            />

            <CustomToolEditor
              customTools={draft.customTools || []}
              onChange={(tools) => setDraft({ ...draft, customTools: tools })}
            />

            <McpServerManager
              servers={draft.mcpServers || []}
              onChange={(servers) => setDraft({ ...draft, mcpServers: servers })}
            />

            {/* Webhook API Keys */}
            <div>
              <label className="block text-sm font-medium mb-2">Webhook API 키</label>
              <p className="text-xs text-muted mb-2">외부 서비스에서 에이전트를 호출할 수 있는 API 키입니다.</p>

              {createdKey && (
                <div className="bg-accent/10 border border-accent rounded-lg p-3 mb-2">
                  <p className="text-xs text-accent mb-1">API 키가 생성되었습니다. 이 키를 복사하세요 (다시 표시되지 않습니다):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-[#111] rounded px-2 py-1 break-all">{createdKey}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(createdKey); }}
                      className="text-xs text-accent hover:text-accent-hover shrink-0"
                    >복사</button>
                  </div>
                  <button
                    onClick={() => setCreatedKey(null)}
                    className="text-xs text-muted mt-1 hover:text-foreground"
                  >닫기</button>
                </div>
              )}

              {webhookKeys.length > 0 && (
                <div className="space-y-1 mb-2">
                  {webhookKeys.map((k) => (
                    <div key={k.id} className="flex items-center gap-2 bg-card rounded-lg px-3 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{k.name}</div>
                        <div className="text-xs text-muted">
                          {k.keyPrefix}... · {new Date(k.createdAt).toLocaleDateString()}
                          {k.lastUsedAt && ` · 마지막: ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/webhooks/keys?id=${k.id}`, { method: 'DELETE' });
                          setWebhookKeys((prev) => prev.filter((x) => x.id !== k.id));
                        }}
                        className="text-error hover:text-red-400 text-xs shrink-0"
                      >삭제</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="키 이름 (예: GitHub)"
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/webhooks/keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newKeyName || 'Unnamed Key' }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setCreatedKey(data.key);
                        setNewKeyName('');
                        // Refresh key list
                        const keysRes = await fetch('/api/webhooks/keys');
                        const keysData = await keysRes.json();
                        setWebhookKeys(Array.isArray(keysData) ? keysData : []);
                      }
                    } catch (err) {
                      console.error('[createWebhookKey]', err);
                      addToast('error', 'API 키 생성에 실패했습니다.');
                    }
                  }}
                  disabled={webhookKeys.length >= 10}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 shrink-0"
                >생성</button>
              </div>
              {webhookKeys.length >= 10 && (
                <p className="text-xs text-warning mt-1">최대 10개 키까지 생성 가능합니다.</p>
              )}
            </div>

            {/* Settings Import/Export */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/settings/export');
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'ollamaagent-settings.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('[exportSettings]', err);
                    addToast('error', '설정 내보내기에 실패했습니다.');
                  }
                }}
                className="flex-1 py-2 text-sm text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
              >
                설정 내보내기
              </button>
              <label className="flex-1 py-2 text-sm text-center text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer">
                설정 가져오기
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      const res = await fetch('/api/settings/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      });
                      if (res.ok) {
                        const result = await res.json();
                        setDraft({ ...result.settings });
                      }
                    } catch (err) {
                      console.error('[importSettings]', err);
                      addToast('error', '설정 가져오기에 실패했습니다.');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
