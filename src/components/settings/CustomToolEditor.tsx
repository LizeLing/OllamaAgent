'use client';

import { useState } from 'react';
import { CustomToolDef } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';

interface CustomToolEditorProps {
  customTools: CustomToolDef[];
  onChange: (tools: CustomToolDef[]) => void;
}

export default function CustomToolEditor({ customTools, onChange }: CustomToolEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');

  const inputClass =
    'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  const handleAdd = () => {
    if (!name || !url) return;
    const newTool: CustomToolDef = {
      id: uuidv4(),
      name,
      description,
      url,
      method,
      parameters: [],
    };
    onChange([...customTools, newTool]);
    setName('');
    setDescription('');
    setUrl('');
    setMethod('GET');
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    onChange(customTools.filter((t) => t.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {isAdding ? '취소' : '+ 추가'}
        </button>
      </div>

      {customTools.length > 0 && (
        <div className="space-y-2 mb-3">
          {customTools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between bg-card rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-mono">{tool.name}</span>
                <span className="text-xs text-muted ml-2">{tool.method} {tool.url}</span>
              </div>
              <button
                onClick={() => handleDelete(tool.id)}
                className="text-xs text-muted hover:text-red-400"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {isAdding && (
        <div className="space-y-2 bg-card rounded-lg p-3">
          <input
            placeholder="도구 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE')}
            className={inputClass + ' appearance-none cursor-pointer'}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
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
