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
import HelpTooltip from '@/components/ui/HelpTooltip';
import SkillEditor from './SkillEditor';
import EventHookEditor from './EventHookEditor';
import CronJobEditor from './CronJobEditor';

interface Voice {
  name: string;
  locale: string;
  gender: string;
}

interface SettingsPanelProps {
  onClose: () => void;
  settings: Settings | null;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}

const HELP = {
  toolApproval:
    '도구 실행 시 사용자 확인을 요구하는 방식을 설정합니다.\n\n' +
    '- 모든 도구 자동 실행: 에이전트가 판단하여 도구를 즉시 실행합니다. 빠르지만 위험한 작업도 확인 없이 수행됩니다.\n' +
    '- 모든 도구 실행 전 확인: 모든 도구 호출 전에 사용자에게 승인을 요청합니다. 가장 안전하지만 응답이 느려질 수 있습니다.\n' +
    '- 위험한 도구만 확인: 파일 쓰기, 명령 실행 등 위험한 도구만 확인하고, 읽기 전용 도구는 자동 실행합니다.',
  systemPrompt:
    '에이전트의 성격과 행동 방식을 정의하는 시스템 프롬프트입니다.\n\n' +
    '에이전트가 응답을 생성할 때 항상 참조하는 기본 지시문으로, 역할(예: 코딩 전문가), 언어(한국어), 응답 스타일(간결함) 등을 지정할 수 있습니다.\n\n' +
    '비워두면 기본 시스템 프롬프트가 사용됩니다. 템플릿에서 미리 준비된 프롬프트를 선택할 수도 있습니다.',
  maxIterations:
    '에이전트가 한 번의 요청에서 도구를 연속으로 호출할 수 있는 최대 반복 횟수입니다.\n\n' +
    '높은 값(20~50): 복잡한 작업을 끝까지 자율적으로 수행하지만, 무한 루프 위험이 있습니다.\n' +
    '낮은 값(1~5): 안전하지만 복잡한 작업이 중간에 중단될 수 있습니다.\n' +
    '권장: 10 (일반적인 작업에 충분)',
  ollamaUrl:
    'Ollama API 서버의 URL입니다.\n\n' +
    '기본값: http://localhost:11434\n' +
    '원격 서버를 사용하는 경우 해당 서버의 주소를 입력하세요.\n\n' +
    'Ollama가 실행 중이지 않으면 연결에 실패합니다. 터미널에서 "ollama serve"로 시작할 수 있습니다.',
  model:
    '응답 생성에 사용할 AI 모델입니다.\n\n' +
    'Ollama에 설치된 모델 목록이 표시됩니다. 새 모델은 터미널에서 "ollama pull <모델명>"으로 설치할 수 있습니다.\n\n' +
    '큰 모델(70B+)은 더 정확하지만 느리고, 작은 모델(7B)은 빠르지만 정확도가 낮습니다.',
  fallbackModels:
    '기본 모델이 응답 생성에 실패했을 때 자동으로 시도할 대체 모델 목록입니다.\n\n' +
    '위에서 아래로 순서대로 시도하며, 성공하면 해당 모델의 응답이 사용됩니다.\n' +
    '예: 큰 모델(70B) → 중간 모델(14B) → 작은 모델(7B) 순으로 설정하면, 메모리 부족 시 자동으로 작은 모델로 전환됩니다.',
  modelOptions:
    '모델의 응답 생성 방식을 제어하는 파라미터입니다.\n\n' +
    '- Temperature: 응답의 무작위성. 낮으면(0.1) 정확하고 일관적이며, 높으면(1.5) 창의적이지만 부정확할 수 있습니다.\n' +
    '- Top P: 토큰 선택 범위. 0.5면 상위 50% 확률의 토큰만, 1.0이면 모든 토큰을 고려합니다.\n' +
    '- Max Tokens: 생성할 최대 토큰 수. 길이 제한으로, 초과하면 응답이 중간에 잘립니다.',
  searxngUrl:
    'SearXNG 검색 엔진의 URL입니다.\n\n' +
    'SearXNG는 프라이버시 중심의 메타 검색 엔진으로, 에이전트가 웹 검색 도구를 사용할 때 이 URL을 통해 검색합니다.\n\n' +
    'Docker로 실행: docker run -p 8888:8080 searxng/searxng\n' +
    '비워두면 웹 검색 기능을 사용할 수 없습니다.',
  ttsVoice:
    '텍스트를 음성으로 변환(TTS)할 때 사용할 음성입니다.\n\n' +
    'Edge TTS 엔진을 사용하며, 다양한 언어와 성별의 음성을 선택할 수 있습니다.\n' +
    '한국어(ko-KR) 음성을 선택하면 자연스러운 한국어 음성 출력이 가능합니다.\n\n' +
    '음성을 선택한 후, 채팅에서 스피커 아이콘을 클릭하면 응답을 음성으로 들을 수 있습니다.',
  allowedPaths:
    '에이전트가 접근할 수 있는 파일 시스템 경로 목록입니다.\n\n' +
    '보안을 위해 에이전트는 이 목록에 포함된 디렉토리와 그 하위 경로에만 접근할 수 있습니다.\n' +
    '예: /home/user/projects → 해당 프로젝트 폴더 내에서만 파일 읽기/쓰기 가능\n\n' +
    '비워두면 모든 경로에 접근 가능합니다 (비추천).',
  deniedPaths:
    '에이전트가 접근할 수 없는 파일 시스템 경로 목록입니다.\n\n' +
    'Allowed Paths보다 우선하며, 여기에 등록된 경로는 절대 접근할 수 없습니다.\n' +
    '예: /etc/passwd, ~/.ssh → 민감한 시스템 파일 보호\n\n' +
    '중요한 설정 파일이나 인증 정보가 포함된 디렉토리를 추가하는 것을 권장합니다.',
  customTools:
    '외부 HTTP API를 도구로 등록하여 에이전트가 호출할 수 있게 합니다.\n\n' +
    '도구 이름, 설명, URL, HTTP 메서드를 지정하면 에이전트가 필요할 때 자동으로 호출합니다.\n' +
    '예: 날씨 API, 번역 API, 사내 API 등을 등록할 수 있습니다.\n\n' +
    '주의: SSRF 방어가 적용되어 내부 네트워크(localhost, 사설 IP)로의 요청은 차단됩니다.',
  mcpServers:
    'Model Context Protocol(MCP) 서버를 연결하여 에이전트의 기능을 확장합니다.\n\n' +
    'MCP는 AI 모델이 외부 도구와 데이터에 접근하기 위한 표준 프로토콜입니다.\n' +
    'SSE(Server-Sent Events) 또는 stdio 전송 방식을 지원합니다.\n\n' +
    '연결된 MCP 서버의 도구가 자동으로 에이전트에 등록되어, 파일 탐색, 데이터베이스 조회, API 호출 등 다양한 기능을 수행할 수 있습니다.',
  webhookKeys:
    '외부 서비스(GitHub, Slack 등)에서 이 에이전트를 호출할 수 있는 API 키입니다.\n\n' +
    '생성된 키를 외부 서비스의 Webhook URL에 설정하면, 해당 서비스에서 이벤트 발생 시 자동으로 에이전트가 실행됩니다.\n' +
    '예: GitHub PR 생성 시 코드 리뷰 자동 수행\n\n' +
    '보안: 키는 생성 시 1회만 표시되며, 해시로 저장됩니다. 최대 10개까지 생성 가능합니다.',
  importExport:
    '설정을 JSON 파일로 내보내거나 가져올 수 있습니다.\n\n' +
    '내보내기: 현재 모든 설정을 파일로 저장합니다. 백업이나 다른 환경으로의 이전에 유용합니다.\n' +
    '가져오기: 저장된 설정 파일을 불러와 적용합니다.\n\n' +
    '주의: 가져오기 시 현재 설정이 덮어씌워집니다.',
  preset:
    '미리 정의된 설정 프리셋을 선택하여 빠르게 적용할 수 있습니다.\n\n' +
    '프리셋은 시스템 프롬프트, 모델 파라미터, 활성화된 도구 등 여러 설정을 한번에 변경합니다.\n' +
    '목적에 맞는 프리셋(코딩, 글쓰기, 분석 등)을 선택하면 최적화된 설정이 즉시 적용됩니다.',
};

export default function SettingsPanel({ onClose, settings, onSave }: SettingsPanelProps) {
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
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  };

  if (!settings) return null;

  const selectClass =
    'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';
  const inputClass =
    'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
          >
            돌아가기
          </button>
        </div>

        <div className="space-y-8">
          {/* Preset */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">프리셋</h3>
              <HelpTooltip text={HELP.preset} />
            </div>
            <PresetSelector
              activePresetId={draft.activePresetId}
              onSelect={(updates) => setDraft({ ...draft, ...updates })}
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
                    onChange={() => setDraft({ ...draft, toolApprovalMode: opt.value })}
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
              onChange={(v) => setDraft({ ...draft, systemPrompt: v })}
            />
          </section>

          <hr className="border-border" />

          {/* Model & Connection */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-4">모델 및 연결</h3>
            <div className="space-y-5">
              {/* Max Iterations */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium">Max Iterations</label>
                  <HelpTooltip text={HELP.maxIterations} />
                </div>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={draft.maxIterations || 10}
                  onChange={(e) => setDraft({ ...draft, maxIterations: parseInt(e.target.value) || 10 })}
                  className="w-24 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>

              {/* Ollama URL */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium">Ollama URL</label>
                  <HelpTooltip text={HELP.ollamaUrl} />
                </div>
                <input
                  value={draft.ollamaUrl || ''}
                  onChange={(e) => setDraft({ ...draft, ollamaUrl: e.target.value })}
                  className={inputClass}
                />
              </div>

              {/* Model Dropdown */}
              <div>
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
                            setDraft({ ...draft, fallbackModels: arr });
                          }}
                          disabled={i === 0}
                          className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                          title="위로"
                        >&#9650;</button>
                        <button
                          onClick={() => {
                            const arr = [...(draft.fallbackModels || [])];
                            if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
                            setDraft({ ...draft, fallbackModels: arr });
                          }}
                          disabled={i === (draft.fallbackModels || []).length - 1}
                          className="text-muted hover:text-foreground disabled:opacity-20 text-xs"
                          title="아래로"
                        >&#9660;</button>
                        <button
                          onClick={() => {
                            setDraft({ ...draft, fallbackModels: (draft.fallbackModels || []).filter((_, idx) => idx !== i) });
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
            </div>
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
              onChange={(modelOptions) => setDraft({ ...draft, modelOptions })}
            />
          </section>

          <hr className="border-border" />

          {/* Search & Voice */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-4">검색 및 음성</h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium">SearXNG URL</label>
                  <HelpTooltip text={HELP.searxngUrl} />
                </div>
                <input
                  value={draft.searxngUrl || ''}
                  onChange={(e) => setDraft({ ...draft, searxngUrl: e.target.value })}
                  className={inputClass}
                />
              </div>

              {/* TTS Voice Dropdown */}
              <div>
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
            </div>
          </section>

          <hr className="border-border" />

          {/* Security */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-4">보안 및 경로</h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium">Allowed Paths</h4>
                  <HelpTooltip text={HELP.allowedPaths} />
                </div>
                <PathConfigEditor
                  label=""
                  paths={draft.allowedPaths || []}
                  onChange={(paths) => setDraft({ ...draft, allowedPaths: paths })}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium">Denied Paths</h4>
                  <HelpTooltip text={HELP.deniedPaths} />
                </div>
                <PathConfigEditor
                  label=""
                  paths={draft.deniedPaths || []}
                  onChange={(paths) => setDraft({ ...draft, deniedPaths: paths })}
                />
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* Extensions */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-4">확장 기능</h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium">커스텀 도구</h4>
                  <HelpTooltip text={HELP.customTools} />
                </div>
                <CustomToolEditor
                  customTools={draft.customTools || []}
                  onChange={(tools) => setDraft({ ...draft, customTools: tools })}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium">MCP 서버</h4>
                  <HelpTooltip text={HELP.mcpServers} />
                </div>
                <McpServerManager
                  servers={draft.mcpServers || []}
                  onChange={(servers) => setDraft({ ...draft, mcpServers: servers })}
                />
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* Skills */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">스킬</h3>
              <HelpTooltip text="다단계 워크플로우를 정의하여 에이전트가 복잡한 작업을 체계적으로 수행하도록 합니다.\n\n스킬은 여러 단계의 지시문과 사용할 도구를 미리 정의해두고, /skill 명령어로 실행합니다.\n예: 코드 리뷰, 리서치 보고서, 디버그 보조 등" />
            </div>
            <SkillEditor />
          </section>

          <hr className="border-border" />

          {/* SubAgent */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">서브에이전트</h3>
              <HelpTooltip text="메인 에이전트가 전문 하위 에이전트에게 작업을 위임합니다.\n\n내장 타입:\n- coder: 파일 시스템 탐색, 코드 작성/수정/실행\n- researcher: 웹 검색, HTTP 요청으로 정보 수집\n- analyst: 파일 읽기, 코드 실행으로 데이터 분석\n\n에이전트가 자동으로 delegate_to_subagent 도구를 사용합니다." />
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

          <hr className="border-border" />

          {/* Event Hooks */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">이벤트 훅</h3>
              <HelpTooltip text="에이전트 이벤트(메시지 수신, 응답 완료, 도구 실행 등) 발생 시 자동으로 액션을 실행합니다.\n\n액션 유형:\n- Webhook: 외부 URL로 HTTP 요청\n- Log: 파일에 이벤트 기록\n- Memory Save: 이벤트를 메모리에 저장\n\n필터를 설정하여 특정 조건에만 실행되도록 할 수 있습니다." />
            </div>
            <EventHookEditor />
          </section>

          <hr className="border-border" />

          {/* Cron Jobs */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">예약 작업</h3>
              <HelpTooltip text="주기적으로 자동 실행되는 예약 작업을 관리합니다.\n\n작업 유형:\n- 에이전트 실행: 지정된 프롬프트로 에이전트 자동 실행\n- HTTP 요청: 외부 API 주기적 호출\n- 메모리 정리: 오래된 메모리 자동 삭제\n- 건강 체크: 시스템 상태 모니터링\n\n크론 표현식으로 실행 주기를 설정합니다." />
            </div>
            <CronJobEditor />
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
          </section>

          {/* Save */}
          <div className="sticky bottom-0 pt-4 pb-2 bg-background">
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
    </div>
  );
}
