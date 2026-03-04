'use client';

import { useState } from 'react';
import { McpServerConfig } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';

interface McpServerManagerProps {
  servers: McpServerConfig[];
  onChange: (servers: McpServerConfig[]) => void;
}

export default function McpServerManager({ servers, onChange }: McpServerManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse'>('sse');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, boolean>>({});

  const inputClass =
    'w-full bg-[#111] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  const handleAdd = () => {
    if (!name || !url) return;
    const newServer: McpServerConfig = {
      id: uuidv4(),
      name,
      url,
      transport,
      enabled: true,
    };
    onChange([...servers, newServer]);
    setName('');
    setUrl('');
    setTransport('sse');
    setIsAdding(false);
  };

  const handleToggle = (id: string) => {
    onChange(servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleDelete = (id: string) => {
    onChange(servers.filter((s) => s.id !== id));
  };

  const handleTest = async (server: McpServerConfig) => {
    setTesting(server.id);
    try {
      const res = await fetch('/api/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', url: server.url }),
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [server.id]: data.connected }));
    } catch {
      setTestResult((prev) => ({ ...prev, [server.id]: false }));
    }
    setTesting(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium">MCP 서버</label>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {isAdding ? '취소' : '+ 추가'}
        </button>
      </div>

      {servers.length > 0 && (
        <div className="space-y-2 mb-3">
          {servers.map((server) => (
            <div key={server.id} className="bg-card rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(server.id)}
                    className={`w-8 h-4 rounded-full transition-colors relative ${
                      server.enabled ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        server.enabled ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm">{server.name}</span>
                  <span className="text-xs text-muted">{server.transport}</span>
                </div>
                <div className="flex items-center gap-2">
                  {testResult[server.id] !== undefined && (
                    <span className={`text-xs ${testResult[server.id] ? 'text-green-400' : 'text-red-400'}`}>
                      {testResult[server.id] ? '연결됨' : '실패'}
                    </span>
                  )}
                  <button
                    onClick={() => handleTest(server)}
                    disabled={testing === server.id}
                    className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    {testing === server.id ? '테스트중...' : '테스트'}
                  </button>
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted mt-1 truncate">{server.url}</div>
            </div>
          ))}
        </div>
      )}

      {servers.length === 0 && !isAdding && (
        <p className="text-xs text-muted">등록된 MCP 서버가 없습니다.</p>
      )}

      {isAdding && (
        <div className="space-y-2 bg-card rounded-lg p-3">
          <input
            placeholder="서버 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="URL (예: http://localhost:3001)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as 'stdio' | 'sse')}
            className={inputClass + ' appearance-none cursor-pointer'}
          >
            <option value="sse">SSE</option>
            <option value="stdio">stdio</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!name || !url}
            className="w-full py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}
