'use client';

import { useState, useEffect } from 'react';
import { Settings, ToolApprovalMode } from '@/types/settings';
import { addToast } from '@/hooks/useToast';
import SystemPromptEditor from '../SystemPromptEditor';
import PresetSelector from '../PresetSelector';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface Voice {
  name: string;
  locale: string;
  gender: string;
}

interface GeneralTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

const HELP = {
  preset: '미리 정의된 설정 프리셋을 선택하여 빠르게 적용할 수 있습니다.',
  toolApproval: '도구 실행 시 사용자 확인을 요구하는 방식을 설정합니다.',
  systemPrompt: '에이전트의 성격과 행동 방식을 정의하는 시스템 프롬프트입니다.',
  searxngUrl: 'SearXNG 검색 엔진의 URL입니다.\n\nDocker로 실행: docker run -p 8888:8080 searxng/searxng',
  ttsVoice: '텍스트를 음성으로 변환(TTS)할 때 사용할 음성입니다.',
  importExport: '설정을 JSON 파일로 내보내거나 가져올 수 있습니다.',
};

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
const selectClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

export default function GeneralTab({ draft, onDraftChange }: GeneralTabProps) {
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    fetch('/api/voices')
      .then((r) => r.json())
      .then((data) => setVoices(data.voices || []))
      .catch(() => setVoices([]));
  }, []);

  // Group voices by locale
  const voicesByLocale = voices.reduce<Record<string, Voice[]>>((acc, v) => {
    (acc[v.locale] ||= []).push(v);
    return acc;
  }, {});
  const sortedLocales = Object.keys(voicesByLocale).sort((a, b) => {
    if (a.startsWith('ko')) return -1;
    if (b.startsWith('ko')) return 1;
    if (a.startsWith('en')) return -1;
    if (b.startsWith('en')) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-8">
      {/* Preset */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">프리셋</h3>
          <HelpTooltip text={HELP.preset} />
        </div>
        <PresetSelector
          activePresetId={draft.activePresetId}
          onSelect={(updates) => onDraftChange(updates)}
        />
      </section>

      <hr className="border-border" />

      {/* Tool Approval Mode */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">도구 승인 모드</h3>
          <HelpTooltip text={HELP.toolApproval} />
        </div>
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
                onChange={() => onDraftChange({ toolApprovalMode: opt.value })}
                className="accent-accent"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <hr className="border-border" />

      {/* System Prompt */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">System Prompt</h3>
          <HelpTooltip text={HELP.systemPrompt} />
        </div>
        <SystemPromptEditor
          value={draft.systemPrompt || ''}
          onChange={(v) => onDraftChange({ systemPrompt: v })}
        />
      </section>

      <hr className="border-border" />

      {/* SearXNG URL */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">SearXNG URL</h3>
          <HelpTooltip text={HELP.searxngUrl} />
        </div>
        <input
          value={draft.searxngUrl || ''}
          onChange={(e) => onDraftChange({ searxngUrl: e.target.value })}
          className={inputClass}
        />
      </section>

      <hr className="border-border" />

      {/* TTS Voice */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">TTS Voice</h3>
          <HelpTooltip text={HELP.ttsVoice} />
        </div>
        {voices.length > 0 ? (
          <div className="relative">
            <select
              value={draft.ttsVoice || ''}
              onChange={(e) => onDraftChange({ ttsVoice: e.target.value })}
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
            onChange={(e) => onDraftChange({ ttsVoice: e.target.value })}
            className={inputClass}
            placeholder="e.g. ko-KR-SunHiNeural"
          />
        )}
      </section>

      <hr className="border-border" />

      {/* Settings Import/Export */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">설정 백업</h3>
          <HelpTooltip text={HELP.importExport} />
        </div>
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
                    onDraftChange(result.settings);
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
      </section>
    </div>
  );
}
