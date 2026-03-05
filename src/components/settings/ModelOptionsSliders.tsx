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
  describe: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => v.toFixed(1),
    describe: (v) => {
      if (v <= 0.3) return '매우 정확하고 결정적인 응답';
      if (v <= 0.7) return '균형 잡힌 응답';
      if (v <= 1.2) return '창의적이고 다양한 응답';
      return '매우 무작위적 (비추천)';
    },
  },
  {
    key: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    describe: (v) => {
      if (v <= 0.5) return '상위 토큰만 사용 (집중적)';
      if (v <= 0.8) return '적당한 다양성';
      return '대부분의 토큰 고려 (다양)';
    },
  },
  {
    key: 'numPredict',
    label: 'Max Tokens',
    min: 256,
    max: 8192,
    step: 256,
    format: (v) => v.toString(),
    describe: (v) => {
      if (v <= 512) return '짧은 응답';
      if (v <= 2048) return '일반적인 길이';
      if (v <= 4096) return '긴 응답';
      return '매우 긴 응답';
    },
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
              <div className="text-[10px] text-accent/80 mt-0.5">
                {config.describe(value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
