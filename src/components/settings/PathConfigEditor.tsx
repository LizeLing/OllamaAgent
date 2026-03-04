'use client';

import { useState } from 'react';

interface PathConfigEditorProps {
  label: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}

export default function PathConfigEditor({ label, paths, onChange }: PathConfigEditorProps) {
  const [input, setInput] = useState('');

  const addPath = () => {
    const trimmed = input.trim();
    if (trimmed && !paths.includes(trimmed)) {
      onChange([...paths, trimmed]);
      setInput('');
    }
  };

  const removePath = (index: number) => {
    onChange(paths.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPath()}
          placeholder="/path/to/directory"
          className="flex-1 bg-[#111] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <button
          onClick={addPath}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors"
        >
          Add
        </button>
      </div>
      <div className="space-y-1">
        {paths.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm bg-[#111] rounded px-3 py-1.5">
            <span className="flex-1 font-[family-name:var(--font-jetbrains)] text-xs truncate">
              {p}
            </span>
            <button
              onClick={() => removePath(i)}
              className="text-muted hover:text-error transition-colors"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
