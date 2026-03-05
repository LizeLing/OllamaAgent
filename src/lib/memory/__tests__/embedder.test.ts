import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../embedder';

describe('cosineSimilarity', () => {
  it('동일한 벡터는 1.0을 반환한다', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('직교 벡터는 0.0을 반환한다', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('반대 방향 벡터는 -1.0을 반환한다', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('길이가 다른 벡터는 0을 반환한다', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('영벡터는 0을 반환한다', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});
