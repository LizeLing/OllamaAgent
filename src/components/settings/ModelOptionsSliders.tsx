'use client';

import { ModelOptions } from '@/types/settings';

interface ModelOptionsSlidersProps {
  options: ModelOptions;
  onChange: (options: ModelOptions) => void;
}

interface SliderConfig {
  key: keyof ModelOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'numPredict',
    label: 'Max Tokens',
    min: 256,
    max: 8192,
    step: 256,
    format: (v) => v.toString(),
  },
];

export default function ModelOptionsSliders({ options, onChange }: ModelOptionsSlidersProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-3">Model Parameters</label>
      <div className="space-y-4">
        {SLIDER_CONFIGS.map((config) => {
          const value = options[config.key];
          return (
            <div key={config.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">{config.label}</span>
                <span className="text-xs font-mono text-foreground">{config.format(value)}</span>
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={value}
                onChange={(e) =>
                  onChange({ ...options, [config.key]: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>{config.format(config.min)}</span>
                <span>{config.format(config.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
