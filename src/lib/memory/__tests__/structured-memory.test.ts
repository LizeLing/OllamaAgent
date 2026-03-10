import { describe, it, expect } from 'vitest';
import { categorizeMemory, getMemoryWeight } from '../structured-memory';

describe('categorizeMemory', () => {
  it('기술 키워드를 technical로 분류한다', () => {
    expect(categorizeMemory('React 컴포넌트 작성')).toBe('technical');
  });

  it('매칭 없으면 general을 반환한다', () => {
    expect(categorizeMemory('오늘 날씨 좋다')).toBe('general');
  });
});

describe('getMemoryWeight', () => {
  it('기본 가중치를 반환한다', () => {
    expect(getMemoryWeight('technical')).toBe(1.2);
  });

  it('커스텀 가중치를 반환한다', () => {
    const custom = { technical: { weight: 2.0, maxAgeDays: 90 } };
    expect(getMemoryWeight('technical', custom)).toBe(2.0);
  });

  it('커스텀에 없는 카테고리는 기본값을 사용한다', () => {
    const custom = { technical: { weight: 2.0, maxAgeDays: 90 } };
    expect(getMemoryWeight('general', custom)).toBe(0.8);
  });
});
