'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  EventHook,
  HookTrigger,
  HookAction,
  HookFilter,
  HookExecutionResult,
  WebhookActionConfig,
  LogActionConfig,
} from '@/types/hooks';

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
const selectClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

const TRIGGER_LABELS: Record<HookTrigger, string> = {
  on_message_received: '메시지 수신',
  on_response_complete: '응답 완료',
  on_tool_start: '도구 시작',
  on_tool_end: '도구 종료',
  on_error: '에러 발생',
  on_conversation_created: '대화 생성',
};

const ACTION_LABELS: Record<HookAction, string> = {
  webhook: 'Webhook 호출',
  log: '로그 기록',
  memory_save: '메모리 저장',
};

export default function EventHookEditor() {
  const [hooks, setHooks] = useState<EventHook[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [logs, setLogs] = useState<HookExecutionResult[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<HookTrigger>('on_message_received');
  const [action, setAction] = useState<HookAction>('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMethod, setWebhookMethod] = useState<'POST' | 'PUT'>('POST');
  const [logFilePath, setLogFilePath] = useState('');
  const [logFormat, setLogFormat] = useState<'json' | 'text'>('json');
  const [filters, setFilters] = useState<HookFilter[]>([]);

  const fetchHooks = useCallback(async () => {
    try {
      const res = await fetch('/api/hooks');
      if (res.ok) {
        const data = await res.json();
        setHooks(data);
      }
    } catch {
      console.error('Failed to fetch hooks');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/hooks/logs?limit=10');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      console.error('Failed to fetch hook logs');
    }
  }, []);

  useEffect(() => {
    fetchHooks();
  }, [fetchHooks]);

  useEffect(() => {
    if (logsOpen) fetchLogs();
  }, [logsOpen, fetchLogs]);

  const toggleEnabled = async (hook: EventHook) => {
    try {
      const res = await fetch(`/api/hooks/${hook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !hook.enabled }),
      });
      if (res.ok) fetchHooks();
    } catch {
      console.error('Failed to toggle hook');
    }
  };

  const deleteHook = async (id: string) => {
    try {
      const res = await fetch(`/api/hooks/${id}`, { method: 'DELETE' });
      if (res.ok) fetchHooks();
    } catch {
      console.error('Failed to delete hook');
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setTrigger('on_message_received');
    setAction('webhook');
    setWebhookUrl('');
    setWebhookMethod('POST');
    setLogFilePath('');
    setLogFormat('json');
    setFilters([]);
  };

  const handleAdd = async () => {
    if (!name) return;
    if (action === 'webhook' && !webhookUrl) return;
    if (action === 'log' && !logFilePath) return;

    let actionConfig: WebhookActionConfig | LogActionConfig | Record<string, never>;
    if (action === 'webhook') {
      actionConfig = { url: webhookUrl, method: webhookMethod };
    } else if (action === 'log') {
      actionConfig = { filePath: logFilePath, format: logFormat };
    } else {
      actionConfig = {};
    }

    try {
      const res = await fetch('/api/hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          trigger,
          action,
          actionConfig,
          filters: filters.length > 0 ? filters : undefined,
        }),
      });
      if (res.ok) {
        fetchHooks();
        resetForm();
        setIsAdding(false);
      }
    } catch {
      console.error('Failed to create hook');
    }
  };

  const addFilter = () => {
    setFilters([...filters, { field: '', operator: 'equals', value: '' }]);
  };

  const updateFilter = (index: number, patch: Partial<HookFilter>) => {
    setFilters(filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div className="text-sm text-muted py-2">로딩 중...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => { setIsAdding(!isAdding); if (isAdding) resetForm(); }}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {isAdding ? '취소' : '+ 추가'}
        </button>
      </div>

      {/* Hook List */}
      {hooks.length > 0 && (
        <div className="space-y-2 mb-3">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="bg-card rounded-lg px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleEnabled(hook)}
                    className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${
                      hook.enabled ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                        hook.enabled ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm font-mono truncate">{hook.name}</span>
                </div>
                <button
                  onClick={() => deleteHook(hook.id)}
                  className="text-xs text-muted hover:text-red-400 flex-shrink-0 ml-2"
                >
                  삭제
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted pl-10">
                <span>{TRIGGER_LABELS[hook.trigger]}</span>
                <span>{ACTION_LABELS[hook.action]}</span>
                <span>실행 {hook.triggerCount}회</span>
                {hook.lastTriggeredAt && (
                  <span>마지막: {formatTime(hook.lastTriggeredAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hooks.length === 0 && !isAdding && (
        <div className="text-sm text-muted text-center py-4">
          등록된 이벤트 훅이 없습니다.
        </div>
      )}

      {/* Add Form */}
      {isAdding && (
        <div className="space-y-2 bg-card rounded-lg p-3 mb-3">
          <input
            placeholder="훅 이름 (필수)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />

          {/* Trigger */}
          <label className="text-xs text-muted block">트리거</label>
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as HookTrigger)}
            className={selectClass}
          >
            {(Object.entries(TRIGGER_LABELS) as [HookTrigger, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Action */}
          <label className="text-xs text-muted block">액션</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as HookAction)}
            className={selectClass}
          >
            {(Object.entries(ACTION_LABELS) as [HookAction, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Dynamic Action Config */}
          {action === 'webhook' && (
            <div className="space-y-2 pl-2 border-l-2 border-border">
              <input
                placeholder="Webhook URL (필수)"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={inputClass}
              />
              <select
                value={webhookMethod}
                onChange={(e) => setWebhookMethod(e.target.value as 'POST' | 'PUT')}
                className={selectClass}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          )}

          {action === 'log' && (
            <div className="space-y-2 pl-2 border-l-2 border-border">
              <input
                placeholder="로그 파일 경로 (필수)"
                value={logFilePath}
                onChange={(e) => setLogFilePath(e.target.value)}
                className={inputClass}
              />
              <select
                value={logFormat}
                onChange={(e) => setLogFormat(e.target.value as 'json' | 'text')}
                className={selectClass}
              >
                <option value="json">JSON</option>
                <option value="text">Text</option>
              </select>
            </div>
          )}

          {action === 'memory_save' && (
            <div className="pl-2 border-l-2 border-border">
              <p className="text-xs text-muted">이벤트 데이터가 메모리에 자동 저장됩니다.</p>
            </div>
          )}

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">필터 (선택)</label>
              <button
                onClick={addFilter}
                className="text-xs text-accent hover:text-accent-hover"
              >
                + 필터 추가
              </button>
            </div>
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 mt-1.5">
                <input
                  placeholder="필드"
                  value={f.field}
                  onChange={(e) => updateFilter(i, { field: e.target.value })}
                  className={inputClass + ' flex-1'}
                />
                <select
                  value={f.operator}
                  onChange={(e) => updateFilter(i, { operator: e.target.value as HookFilter['operator'] })}
                  className={selectClass + ' w-28 flex-shrink-0'}
                >
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                  <option value="not_equals">not_equals</option>
                </select>
                <input
                  placeholder="값"
                  value={f.value}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  className={inputClass + ' flex-1'}
                />
                <button
                  onClick={() => removeFilter(i)}
                  className="text-xs text-muted hover:text-red-400 flex-shrink-0"
                >
                  X
                </button>
              </div>
            ))}
          </div>

          {/* Submit */}
          <button
            onClick={handleAdd}
            disabled={!name || (action === 'webhook' && !webhookUrl) || (action === 'log' && !logFilePath)}
            className="w-full py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            저장
          </button>
        </div>
      )}

      {/* Execution Logs */}
      <div className="border-t border-border pt-2 mt-2">
        <button
          onClick={() => setLogsOpen(!logsOpen)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground w-full"
        >
          <span className={`transition-transform ${logsOpen ? 'rotate-90' : ''}`}>&#9654;</span>
          최근 실행 로그
        </button>
        {logsOpen && (
          <div className="mt-2 space-y-1.5">
            {logs.length === 0 ? (
              <p className="text-xs text-muted text-center py-2">실행 로그가 없습니다.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 bg-card rounded-lg px-3 py-1.5 text-xs">
                  <span className={`flex-shrink-0 mt-0.5 ${log.success ? 'text-green-400' : 'text-red-400'}`}>
                    {log.success ? '●' : '●'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-muted">
                      <span className="font-mono">{log.hookId.slice(0, 8)}</span>
                      <span>{log.duration}ms</span>
                      <span>{formatTime(log.timestamp)}</span>
                    </div>
                    {log.error && (
                      <p className="text-red-400 mt-0.5 break-all">{log.error}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
