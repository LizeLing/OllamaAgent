import { describe, it, expect } from 'vitest';
import { DEFAULT_PRESETS } from '../defaults';

describe('DEFAULT_PRESETS', () => {
  it('3개의 프리셋을 포함한다', () => {
    expect(DEFAULT_PRESETS).toHaveLength(3);
  });

  it('각 프리셋에 id, name, systemPrompt, enabledTools가 있다', () => {
    for (const preset of DEFAULT_PRESETS) {
      expect(preset.id).toBeDefined();
      expect(preset.id).not.toBe('');
      expect(preset.name).toBeDefined();
      expect(preset.name).not.toBe('');
      expect(preset.systemPrompt).toBeDefined();
      expect(Array.isArray(preset.enabledTools)).toBe(true);
    }
  });

  it('프리셋 id가 고유하다', () => {
    const ids = DEFAULT_PRESETS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
