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
  allowedPaths: '에이전트가 접근할 수 있는 파일 시스템 경로 목록입니다.',
  deniedPaths:
    '에이전트가 접근할 수 없는 파일 시스템 경로 목록입니다.\n\nAllowed Paths보다 우선합니다.',
  webhookKeys:
    '외부 서비스에서 이 에이전트를 호출할 수 있는 API 키입니다.\n\n최대 10개까지 생성 가능합니다.',
};

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

export default function SecurityTab({ draft, onDraftChange }: SecurityTabProps) {
  const [webhookKeys, setWebhookKeys] = useState<WebhookKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/webhooks/keys')
      .then((res) => res.json())
      .then((data) => setWebhookKeys(data))
      .catch(() => addToast('error', 'Webhook 키 목록을 불러오지 못했습니다.'));
  }, []);

  const createKey = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    if (webhookKeys.length >= 10) {
      addToast('warning', '최대 10개까지 생성할 수 있습니다.');
      return;
    }
    try {
      const res = await fetch('/api/webhooks/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWebhookKeys((prev) => [...prev, data.key]);
      setCreatedKey(data.rawKey);
      setNewKeyName('');
      addToast('info', 'API 키가 생성되었습니다.');
    } catch {
      addToast('error', 'API 키 생성에 실패했습니다.');
    }
  };

  const deleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/keys?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setWebhookKeys((prev) => prev.filter((k) => k.id !== id));
      addToast('info', 'API 키가 삭제되었습니다.');
    } catch {
      addToast('error', 'API 키 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Allowed Paths */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Allowed Paths</h3>
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
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Denied Paths</h3>
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

        {/* Key list */}
        <div className="space-y-2 mb-4">
          {webhookKeys.length === 0 && (
            <p className="text-xs text-muted">등록된 API 키가 없습니다.</p>
          )}
          {webhookKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <span className="font-medium truncate min-w-0">{k.name}</span>
              <span className="font-[family-name:var(--font-jetbrains)] text-xs text-muted">
                {k.keyPrefix}...
              </span>
              <span className="text-xs text-muted ml-auto whitespace-nowrap">
                {new Date(k.createdAt).toLocaleDateString()}
              </span>
              {k.lastUsedAt && (
                <span className="text-xs text-muted whitespace-nowrap">
                  최근 사용: {new Date(k.lastUsedAt).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => deleteKey(k.id)}
                className="text-muted hover:text-error transition-colors ml-1"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* Created key display (one-time) */}
        {createdKey && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-xs text-green-400 mb-1 font-semibold">
              생성된 키 (이 값은 다시 표시되지 않습니다):
            </p>
            <code className="block text-xs font-[family-name:var(--font-jetbrains)] text-green-300 break-all select-all">
              {createdKey}
            </code>
          </div>
        )}

        {/* New key creation */}
        <div className="flex gap-2">
          <input
            value={newKeyName}
            onChange={(e) => {
              setNewKeyName(e.target.value);
              setCreatedKey(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
            placeholder="키 이름 (예: GitHub)"
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={createKey}
            disabled={webhookKeys.length >= 10}
            className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            생성
          </button>
        </div>
        {webhookKeys.length >= 10 && (
          <p className="text-xs text-muted mt-1">최대 10개 제한에 도달했습니다.</p>
        )}
      </section>
    </div>
  );
}
