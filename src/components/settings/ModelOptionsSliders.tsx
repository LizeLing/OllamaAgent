'use client';

import { ModelOptions } from '@/types/settings';

interface ModelOptionsSlidersProps {
  options: ModelOptions;
  onChange: (options: ModelOptions) => void;
  maxContextLength?: number;
}

interface SliderConfig {
  key: keyof ModelOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  describe: (v: number, max: number) => string;
}

function buildSliderConfigs(maxTokens: number): SliderConfig[] {
  // step을 context 크기에 맞게 조정
  const step = maxTokens >= 16384 ? 1024 : maxTokens >= 4096 ? 512 : 256;

  return [
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
      max: maxTokens,
      step,
      format: (v) => v.toLocaleString(),
      describe: (v, max) => {
        const ratio = v / max;
        if (ratio <= 0.1) return '짧은 응답';
        if (ratio <= 0.25) return '일반적인 길이';
        if (ratio <= 0.5) return '긴 응답';
        return '매우 긴 응답';
      },
    },
  ];
}

export default function ModelOptionsSliders({ options, onChange, maxContextLength }: ModelOptionsSlidersProps) {
  const maxTokens = maxContextLength ?? 8192;
  const configs = buildSliderConfigs(maxTokens);

  // numPredict가 현재 모델의 max를 초과하면 클램프
  const clampedNumPredict = Math.min(options.numPredict, maxTokens);
  const displayOptions = clampedNumPredict !== options.numPredict
    ? { ...options, numPredict: clampedNumPredict }
    : options;

  return (
    <div>
      <label className="block text-sm font-medium mb-3">Model Parameters</label>
      <div className="space-y-4">
        {configs.map((config) => {
          const value = displayOptions[config.key];
          return (
            <div key={config.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">
                  {config.label}
                  {config.key === 'numPredict' && maxContextLength && (
                    <span className="ml-1 text-accent/60">(ctx: {maxContextLength.toLocaleString()})</span>
                  )}
                </span>
                <span className="text-xs font-mono text-foreground">{config.format(value)}</span>
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={value}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  onChange({ ...displayOptions, [config.key]: newValue });
                }}
                className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>{config.format(config.min)}</span>
                <span>{config.format(config.max)}</span>
              </div>
              <div className="text-[10px] text-accent/80 mt-0.5">
                {config.describe(value, config.max)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
