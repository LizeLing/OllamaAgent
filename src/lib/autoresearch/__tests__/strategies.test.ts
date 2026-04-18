import { describe, it, expect } from 'vitest';
import { getStrategies, getStrategyById } from '../strategies';
import { AgentConfig } from '@/lib/agent/types';

const baseConfig: AgentConfig = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3.5:9b',
  maxIterations: 10,
  systemPrompt: '테스트 프롬프트',
  allowedPaths: ['/tmp'],
  deniedPaths: [],
  modelOptions: { temperature: 0.7, top_p: 0.9 },
  thinkingMode: 'auto',
  thinkingForToolCalls: false,
};

describe('getStrategies', () => {
  it('전략 목록이 비어있지 않다', () => {
    const strategies = getStrategies();
    expect(strategies.length).toBeGreaterThan(0);
  });

  it('현재 설정과 동일한 전략은 제외된다', () => {
    const all = getStrategies();
    const filtered = getStrategies(baseConfig);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  it('각 전략이 id, name, description, apply를 가진다', () => {
    for (const s of getStrategies()) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(typeof s.apply).toBe('function');
    }
  });
});

describe('strategy.apply', () => {
  it('temperature 전략이 올바른 오버라이드 반환', () => {
    const strategy = getStrategyById('temp-0.3');
    expect(strategy).toBeDefined();

    const { overrides, changes } = strategy!.apply(baseConfig);
    expect(overrides.modelOptions?.temperature).toBe(0.3);
    expect(changes.temperature.before).toBe(0.7);
    expect(changes.temperature.after).toBe(0.3);
  });

  it('thinking 전략이 올바른 오버라이드 반환', () => {
    const strategy = getStrategyById('thinking-on');
    expect(strategy).toBeDefined();

    const { overrides, changes } = strategy!.apply(baseConfig);
    expect(overrides.thinkingMode).toBe('on');
    expect(changes.thinkingMode.before).toBe('auto');
    expect(changes.thinkingMode.after).toBe('on');
  });

  it('시스템 프롬프트 전략이 변경 내역 포함', () => {
    const strategy = getStrategyById('prompt-concise');
    expect(strategy).toBeDefined();

    const { overrides, changes } = strategy!.apply(baseConfig);
    expect(overrides.systemPrompt).toBeDefined();
    expect(changes.systemPrompt).toBeDefined();
  });
});

describe('getStrategyById', () => {
  it('존재하는 전략 반환', () => {
    expect(getStrategyById('temp-0.5')).toBeDefined();
  });

  it('존재하지 않는 전략은 undefined', () => {
    expect(getStrategyById('nonexistent')).toBeUndefined();
  });
});
