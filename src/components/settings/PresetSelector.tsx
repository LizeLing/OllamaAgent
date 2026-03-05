'use client';

import { useState, useEffect } from 'react';
import { AgentPreset, Settings } from '@/types/settings';
import { DEFAULT_PRESETS } from '@/lib/presets/defaults';

interface PresetSelectorProps {
  activePresetId?: string;
  onSelect: (updates: Partial<Settings>) => void;
}

export default function PresetSelector({ activePresetId, onSelect }: PresetSelectorProps) {
  const [presets, setPresets] = useState<AgentPreset[]>(DEFAULT_PRESETS);

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json())
      .then((data) => setPresets(data.presets || DEFAULT_PRESETS))
      .catch(() => {});
  }, []);

  const handleSelect = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      onSelect({
        activePresetId: preset.id,
        systemPrompt: preset.systemPrompt,
        enabledTools: preset.enabledTools,
      });
    }
  };

  const defaultIds = DEFAULT_PRESETS.map((p) => p.id);

  return (
    <div>
      <label className="block text-sm font-medium mb-2">에이전트 프리셋</label>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelect(preset.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              activePresetId === preset.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-card text-muted hover:text-foreground hover:border-accent/50'
            }`}
          >
            {preset.name}
            {!defaultIds.includes(preset.id) && (
              <span className="ml-1 text-xs opacity-60">커스텀</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
