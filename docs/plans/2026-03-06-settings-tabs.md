# Settings 탭 페이지 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 단일 스크롤 SettingsPanel(740줄)을 5개 탭(일반/모델/보안/확장/자동화)으로 분리하여 UX 개선

**Architecture:** SettingsPanel이 탭 바 + draft 상태를 소유하고, 각 탭은 별도 컴포넌트로 분리. 공통 TabProps 인터페이스로 draft/onDraftChange를 전달. 독립 컴포넌트(SkillEditor, CronJobEditor 등)는 그대로 임베드.

**Tech Stack:** React, TypeScript, Tailwind CSS, Next.js

**Design doc:** `docs/plans/2026-03-06-settings-tabs-design.md`

---

### Task 1: GeneralTab 컴포넌트 생성

**Files:**
- Create: `src/components/settings/tabs/GeneralTab.tsx`

**Context:**
- 현재 SettingsPanel.tsx에서 프리셋, 도구 승인 모드, System Prompt, SearXNG, TTS, 설정 백업 섹션을 추출
- HELP 객체에서 해당 키: `preset`, `toolApproval`, `systemPrompt`, `searxngUrl`, `ttsVoice`, `importExport`

**Step 1: tabs 디렉토리 생성 확인**

```bash
ls src/components/settings/tabs/ 2>/dev/null || mkdir -p src/components/settings/tabs/
```

**Step 2: GeneralTab.tsx 작성**

```tsx
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
  preset:
    '미리 정의된 설정 프리셋을 선택하여 빠르게 적용할 수 있습니다.\n\n프리셋은 시스템 프롬프트, 모델 파라미터, 활성화된 도구 등 여러 설정을 한번에 변경합니다.\n목적에 맞는 프리셋(코딩, 글쓰기, 분석 등)을 선택하면 최적화된 설정이 즉시 적용됩니다.',
  toolApproval:
    '도구 실행 시 사용자 확인을 요구하는 방식을 설정합니다.\n\n- 모든 도구 자동 실행: 에이전트가 판단하여 도구를 즉시 실행합니다.\n- 모든 도구 실행 전 확인: 모든 도구 호출 전에 사용자에게 승인을 요청합니다.\n- 위험한 도구만 확인: 파일 쓰기, 명령 실행 등 위험한 도구만 확인합니다.',
  systemPrompt:
    '에이전트의 성격과 행동 방식을 정의하는 시스템 프롬프트입니다.\n\n비워두면 기본 시스템 프롬프트가 사용됩니다.',
  searxngUrl:
    'SearXNG 검색 엔진의 URL입니다.\n\nDocker로 실행: docker run -p 8888:8080 searxng/searxng\n비워두면 웹 검색 기능을 사용할 수 없습니다.',
  ttsVoice:
    '텍스트를 음성으로 변환(TTS)할 때 사용할 음성입니다.\n\nEdge TTS 엔진을 사용하며, 한국어(ko-KR) 음성을 선택하면 자연스러운 한국어 음성 출력이 가능합니다.',
  importExport:
    '설정을 JSON 파일로 내보내거나 가져올 수 있습니다.\n\n주의: 가져오기 시 현재 설정이 덮어씌워집니다.',
};

export default function GeneralTab({ draft, onDraftChange }: GeneralTabProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const inputClass = 'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
  const selectClass = inputClass + ' appearance-none cursor-pointer';

  useEffect(() => {
    setLoadingVoices(true);
    fetch('/api/voices')
      .then((r) => r.json())
      .then((data) => setVoices(data.voices || []))
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));
  }, []);

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
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">SearXNG URL</label>
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
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">TTS Voice</label>
          <HelpTooltip text={HELP.ttsVoice} />
        </div>
        {loadingVoices ? (
          <div className="text-sm text-muted py-1.5">Loading voices...</div>
        ) : voices.length > 0 ? (
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

      {/* Import/Export */}
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
```

**Step 3: 빌드 확인**

```bash
npx next build 2>&1 | tail -5
```

Expected: 빌드 성공 (GeneralTab은 아직 import되지 않았으므로 unused지만 단독 빌드 가능)

**Step 4: 커밋**

```bash
git add src/components/settings/tabs/GeneralTab.tsx
git commit -m "feat: GeneralTab 컴포넌트 생성 (프리셋/승인/프롬프트/검색/음성/백업)"
```

---

### Task 2: ModelTab 컴포넌트 생성

**Files:**
- Create: `src/components/settings/tabs/ModelTab.tsx`

**Context:**
- SettingsPanel.tsx에서 모델 및 연결, 모델 파라미터 섹션 추출
- HELP 키: `maxIterations`, `ollamaUrl`, `model`, `fallbackModels`, `modelOptions`
- models 목록은 자체 fetch

**Step 1: ModelTab.tsx 작성**

```tsx
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
  ollamaUrl:
    'Ollama API 서버의 URL입니다.\n\n기본값: http://localhost:11434\nOllama가 실행 중이지 않으면 연결에 실패합니다.',
  model:
    '응답 생성에 사용할 AI 모델입니다.\n\nOllama에 설치된 모델 목록이 표시됩니다.\n큰 모델(70B+)은 더 정확하지만 느리고, 작은 모델(7B)은 빠르지만 정확도가 낮습니다.',
  fallbackModels:
    '기본 모델이 응답 생성에 실패했을 때 자동으로 시도할 대체 모델 목록입니다.\n\n위에서 아래로 순서대로 시도합니다.',
  maxIterations:
    '에이전트가 한 번의 요청에서 도구를 연속으로 호출할 수 있는 최대 반복 횟수입니다.\n\n권장: 10',
  modelOptions:
    '모델의 응답 생성 방식을 제어하는 파라미터입니다.\n\n- Temperature: 응답의 무작위성\n- Top P: 토큰 선택 범위\n- Max Tokens: 생성할 최대 토큰 수',
};

export default function ModelTab({ draft, onDraftChange }: ModelTabProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const inputClass = 'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
  const selectClass = inputClass + ' appearance-none cursor-pointer';

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
                >&#9650;</button>
                <button
                  onClick={() => {
                    const arr = [...(draft.fallbackModels || [])];
                    if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
                    onDraftChange({ fallbackModels: arr });
                  }}
                  disabled={i === (draft.fallbackModels || []).length - 1}
                  className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                >&#9660;</button>
                <button
                  onClick={() => {
                    onDraftChange({ fallbackModels: (draft.fallbackModels || []).filter((_, idx) => idx !== i) });
                  }}
                  className="text-error hover:text-red-400 text-xs"
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
```

**Step 2: 커밋**

```bash
git add src/components/settings/tabs/ModelTab.tsx
git commit -m "feat: ModelTab 컴포넌트 생성 (URL/모델/Fallback/파라미터/반복)"
```

---

### Task 3: SecurityTab 컴포넌트 생성

**Files:**
- Create: `src/components/settings/tabs/SecurityTab.tsx`

**Context:**
- SettingsPanel.tsx에서 보안 및 경로, Webhook API 키 섹션 추출
- webhookKeys는 자체 fetch/state

**Step 1: SecurityTab.tsx 작성**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import { addToast } from '@/hooks/useToast';
import PathConfigEditor from '../PathConfigEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface SecurityTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

interface WebhookKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

const HELP = {
  allowedPaths:
    '에이전트가 접근할 수 있는 파일 시스템 경로 목록입니다.\n\n비워두면 모든 경로에 접근 가능합니다 (비추천).',
  deniedPaths:
    '에이전트가 접근할 수 없는 파일 시스템 경로 목록입니다.\n\nAllowed Paths보다 우선합니다.',
  webhookKeys:
    '외부 서비스(GitHub, Slack 등)에서 이 에이전트를 호출할 수 있는 API 키입니다.\n\n키는 생성 시 1회만 표시되며, 해시로 저장됩니다. 최대 10개까지 생성 가능합니다.',
};

export default function SecurityTab({ draft, onDraftChange }: SecurityTabProps) {
  const [webhookKeys, setWebhookKeys] = useState<WebhookKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const inputClass = 'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  useEffect(() => {
    fetch('/api/webhooks/keys')
      .then((r) => r.json())
      .then((data) => setWebhookKeys(Array.isArray(data) ? data : []))
      .catch(() => setWebhookKeys([]));
  }, []);

  return (
    <div className="space-y-8">
      {/* Allowed Paths */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">Allowed Paths</h4>
          <HelpTooltip text={HELP.allowedPaths} />
        </div>
        <PathConfigEditor
          label=""
          paths={draft.allowedPaths || []}
          onChange={(paths) => onDraftChange({ allowedPaths: paths })}
        />
      </section>

      <hr className="border-border" />

      {/* Denied Paths */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">Denied Paths</h4>
          <HelpTooltip text={HELP.deniedPaths} />
        </div>
        <PathConfigEditor
          label=""
          paths={draft.deniedPaths || []}
          onChange={(paths) => onDraftChange({ deniedPaths: paths })}
        />
      </section>

      <hr className="border-border" />

      {/* Webhook API Keys */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Webhook API 키</h3>
          <HelpTooltip text={HELP.webhookKeys} />
        </div>
        <p className="text-xs text-muted mb-3">외부 서비스에서 에이전트를 호출할 수 있는 API 키입니다.</p>

        {createdKey && (
          <div className="bg-accent/10 border border-accent rounded-lg p-3 mb-3">
            <p className="text-xs text-accent mb-1">API 키가 생성되었습니다. 이 키를 복사하세요 (다시 표시되지 않습니다):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-card rounded px-2 py-1 break-all">{createdKey}</code>
              <button
                onClick={() => navigator.clipboard.writeText(createdKey)}
                className="text-xs text-accent hover:text-accent-hover shrink-0"
              >복사</button>
            </div>
            <button onClick={() => setCreatedKey(null)} className="text-xs text-muted mt-1 hover:text-foreground">닫기</button>
          </div>
        )}

        {webhookKeys.length > 0 && (
          <div className="space-y-1 mb-3">
            {webhookKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-2 bg-card rounded-lg px-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{k.name}</div>
                  <div className="text-xs text-muted">
                    {k.keyPrefix}... &middot; {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && ` \u00B7 마지막: ${new Date(k.lastUsedAt).toLocaleDateString()}`}
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
      </section>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add src/components/settings/tabs/SecurityTab.tsx
git commit -m "feat: SecurityTab 컴포넌트 생성 (경로/Webhook 키)"
```

---

### Task 4: ExtensionsTab 컴포넌트 생성

**Files:**
- Create: `src/components/settings/tabs/ExtensionsTab.tsx`

**Context:**
- SettingsPanel.tsx에서 확장 기능, 스킬, 서브에이전트 섹션 추출
- CustomToolEditor, McpServerManager는 draft.customTools/mcpServers 사용
- SkillEditor는 독립

**Step 1: ExtensionsTab.tsx 작성**

```tsx
'use client';

import { Settings } from '@/types/settings';
import CustomToolEditor from '../CustomToolEditor';
import McpServerManager from '../McpServerManager';
import SkillEditor from '../SkillEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface ExtensionsTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

const HELP = {
  customTools:
    '외부 HTTP API를 도구로 등록하여 에이전트가 호출할 수 있게 합니다.\n\nSSRF 방어가 적용되어 내부 네트워크로의 요청은 차단됩니다.',
  mcpServers:
    'Model Context Protocol(MCP) 서버를 연결하여 에이전트의 기능을 확장합니다.\n\nSSE 또는 stdio 전송 방식을 지원합니다.',
  skills:
    '다단계 워크플로우를 정의하여 에이전트가 복잡한 작업을 체계적으로 수행하도록 합니다.\n\n/skill 명령어로 실행합니다.',
  subagent:
    '메인 에이전트가 전문 하위 에이전트에게 작업을 위임합니다.\n\n내장 타입: coder, researcher, analyst',
};

export default function ExtensionsTab({ draft, onDraftChange }: ExtensionsTabProps) {
  return (
    <div className="space-y-8">
      {/* Custom Tools */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">커스텀 도구</h4>
          <HelpTooltip text={HELP.customTools} />
        </div>
        <CustomToolEditor
          customTools={draft.customTools || []}
          onChange={(tools) => onDraftChange({ customTools: tools })}
        />
      </section>

      <hr className="border-border" />

      {/* MCP Servers */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium">MCP 서버</h4>
          <HelpTooltip text={HELP.mcpServers} />
        </div>
        <McpServerManager
          servers={draft.mcpServers || []}
          onChange={(servers) => onDraftChange({ mcpServers: servers })}
        />
      </section>

      <hr className="border-border" />

      {/* Skills */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">스킬</h3>
          <HelpTooltip text={HELP.skills} />
        </div>
        <SkillEditor />
      </section>

      <hr className="border-border" />

      {/* SubAgent */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">서브에이전트</h3>
          <HelpTooltip text={HELP.subagent} />
        </div>
        <div className="bg-card rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">💻</div>
              <div className="text-xs font-medium">Coder</div>
              <div className="text-[10px] text-muted mt-0.5">파일 탐색, 코드 작성</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">🔬</div>
              <div className="text-xs font-medium">Researcher</div>
              <div className="text-[10px] text-muted mt-0.5">웹 검색, 정보 수집</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">📊</div>
              <div className="text-xs font-medium">Analyst</div>
              <div className="text-[10px] text-muted mt-0.5">데이터 분석, 실행</div>
            </div>
          </div>
          <p className="text-xs text-muted">최대 중첩 깊이: 2단계. 에이전트가 필요 시 자동으로 서브에이전트를 호출합니다.</p>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add src/components/settings/tabs/ExtensionsTab.tsx
git commit -m "feat: ExtensionsTab 컴포넌트 생성 (도구/MCP/스킬/서브에이전트)"
```

---

### Task 5: AutomationTab 컴포넌트 생성

**Files:**
- Create: `src/components/settings/tabs/AutomationTab.tsx`

**Context:**
- SettingsPanel.tsx에서 이벤트 훅, 예약 작업 섹션 추출
- 두 컴포넌트 모두 독립 (draft 불필요)

**Step 1: AutomationTab.tsx 작성**

```tsx
'use client';

import EventHookEditor from '../EventHookEditor';
import CronJobEditor from '../CronJobEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

const HELP = {
  hooks:
    '에이전트 이벤트 발생 시 자동으로 액션을 실행합니다.\n\n액션 유형: Webhook, Log, Memory Save\n필터를 설정하여 특정 조건에만 실행되도록 할 수 있습니다.',
  cron:
    '주기적으로 자동 실행되는 예약 작업을 관리합니다.\n\n작업 유형: 에이전트 실행, HTTP 요청, 메모리 정리, 건강 체크',
};

export default function AutomationTab() {
  return (
    <div className="space-y-8">
      {/* Event Hooks */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">이벤트 훅</h3>
          <HelpTooltip text={HELP.hooks} />
        </div>
        <EventHookEditor />
      </section>

      <hr className="border-border" />

      {/* Cron Jobs */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">예약 작업</h3>
          <HelpTooltip text={HELP.cron} />
        </div>
        <CronJobEditor />
      </section>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add src/components/settings/tabs/AutomationTab.tsx
git commit -m "feat: AutomationTab 컴포넌트 생성 (이벤트 훅/예약 작업)"
```

---

### Task 6: SettingsPanel 리팩토링 (탭 바 + 탭 라우팅)

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx` (전체 재작성)

**Context:**
- 기존 740줄 → ~100줄로 축소
- TABS 배열, activeTab 상태, 탭 바 UI, 탭별 조건부 렌더링
- draft 상태와 Save 버튼은 유지

**Step 1: SettingsPanel.tsx 재작성**

기존 내용을 전부 교체. 새 SettingsPanel:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import GeneralTab from './tabs/GeneralTab';
import ModelTab from './tabs/ModelTab';
import SecurityTab from './tabs/SecurityTab';
import ExtensionsTab from './tabs/ExtensionsTab';
import AutomationTab from './tabs/AutomationTab';

interface SettingsPanelProps {
  onClose: () => void;
  settings: Settings | null;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}

const TABS = [
  { id: 'general', label: '일반', icon: '\u2699\uFE0F' },
  { id: 'model', label: '모델', icon: '\uD83E\uDD16' },
  { id: 'security', label: '보안', icon: '\uD83D\uDD12' },
  { id: 'extensions', label: '확장', icon: '\uD83E\uDDE9' },
  { id: 'automation', label: '자동화', icon: '\u26A1' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SettingsPanel({ onClose, settings, onSave }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('general');

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const handleDraftChange = (updates: Partial<Settings>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  };

  if (!settings) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
          >
            돌아가기
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-border mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors relative ${
                activeTab === tab.id
                  ? 'text-accent font-medium'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'model' && <ModelTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'security' && <SecurityTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'extensions' && <ExtensionsTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'automation' && <AutomationTab />}

        {/* Save Button */}
        <div className="sticky bottom-0 pt-6 pb-2 bg-background">
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
  );
}
```

**Step 2: 빌드 확인**

```bash
npx next build 2>&1 | tail -5
```

Expected: 빌드 성공, 모든 라우트 정상

**Step 3: 브라우저에서 기능 확인**

- http://localhost:3000 접속
- 설정 열기 → 5개 탭 표시 확인
- 각 탭 클릭 시 올바른 콘텐츠 렌더링 확인
- 탭 전환 시 draft 값 유지 확인
- Save 버튼 동작 확인

**Step 4: 커밋**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "refactor: SettingsPanel을 5개 탭으로 분리 (740줄 -> 100줄)"
```

---

### Task 7: 빌드 + 통합 테스트 + 최종 커밋

**Step 1: 전체 빌드**

```bash
npx next build
```

Expected: 성공

**Step 2: 개발 서버에서 수동 테스트**

체크리스트:
- [ ] 일반 탭: 프리셋 선택, 도구 승인 모드 변경, 시스템 프롬프트 편집, TTS 음성 선택, 설정 내보내기/가져오기
- [ ] 모델 탭: Ollama URL 변경, 모델 선택, Fallback 추가/삭제/순서변경, Max Iterations 변경, Temperature 슬라이더
- [ ] 보안 탭: Allowed/Denied 경로 추가/삭제, Webhook 키 생성/삭제
- [ ] 확장 탭: 커스텀 도구 추가, MCP 서버 추가, 스킬 목록, 서브에이전트 카드
- [ ] 자동화 탭: 이벤트 훅 목록, Cron 작업 목록/스케줄러
- [ ] 탭 전환 시 draft 유지 확인
- [ ] Save 클릭 시 모든 탭의 변경사항 저장 확인
- [ ] 모바일 크기: 탭 아이콘만 표시

**Step 3: 불필요 import 정리 확인**

SettingsPanel.tsx에서 더 이상 직접 사용하지 않는 import가 없는지 확인.

**Step 4: 최종 커밋 및 푸시**

```bash
git add -A
git commit -m "test: Settings 탭 통합 테스트 통과"
git push origin main
```
