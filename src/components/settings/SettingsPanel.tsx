'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import SystemPromptEditor from './SystemPromptEditor';
import PathConfigEditor from './PathConfigEditor';

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
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">
              &times;
            </button>
          </div>

          <div className="space-y-6">
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
