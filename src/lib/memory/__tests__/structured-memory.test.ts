import { describe, it, expect } from 'vitest';
import {
  categorizeMemory,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from '../structured-memory';

describe('MEMORY_CATEGORIES', () => {
  it('4개의 카테고리가 정의되어 있다', () => {
    const categories = Object.keys(MEMORY_CATEGORIES);
    expect(categories).toHaveLength(4);
    expect(categories).toContain('technical');
    expect(categories).toContain('research');
    expect(categories).toContain('preference');
    expect(categories).toContain('general');
  });

  it('각 카테고리에 weight와 maxAge가 있다', () => {
    for (const cat of Object.values(MEMORY_CATEGORIES)) {
      expect(cat).toHaveProperty('weight');
      expect(cat).toHaveProperty('maxAge');
      expect(typeof cat.weight).toBe('number');
      expect(typeof cat.maxAge).toBe('number');
    }
  });

  it('technical은 weight 1.2, maxAge 60일', () => {
    expect(MEMORY_CATEGORIES.technical.weight).toBe(1.2);
    expect(MEMORY_CATEGORIES.technical.maxAge).toBe(60);
  });

  it('research는 weight 1.0, maxAge 30일', () => {
    expect(MEMORY_CATEGORIES.research.weight).toBe(1.0);
    expect(MEMORY_CATEGORIES.research.maxAge).toBe(30);
  });

  it('preference는 weight 1.5, maxAge 90일', () => {
    expect(MEMORY_CATEGORIES.preference.weight).toBe(1.5);
    expect(MEMORY_CATEGORIES.preference.maxAge).toBe(90);
  });

  it('general은 weight 0.8, maxAge 14일', () => {
    expect(MEMORY_CATEGORIES.general.weight).toBe(0.8);
    expect(MEMORY_CATEGORIES.general.maxAge).toBe(14);
  });

  it('preference > technical > research > general 가중치 순서', () => {
    expect(MEMORY_CATEGORIES.preference.weight).toBeGreaterThan(MEMORY_CATEGORIES.technical.weight);
    expect(MEMORY_CATEGORIES.technical.weight).toBeGreaterThan(MEMORY_CATEGORIES.research.weight);
    expect(MEMORY_CATEGORIES.research.weight).toBeGreaterThan(MEMORY_CATEGORIES.general.weight);
  });
});

describe('categorizeMemory', () => {
  it('코드 관련 텍스트는 technical로 분류', () => {
    expect(categorizeMemory('React 컴포넌트를 TypeScript로 작성')).toBe('technical');
  });

  it('함수/API 관련은 technical로 분류', () => {
    expect(categorizeMemory('API 엔드포인트에서 에러가 발생했습니다')).toBe('technical');
  });

  it('서버/배포 관련은 technical로 분류', () => {
    expect(categorizeMemory('Docker 서버에 배포할 때 git push 필요')).toBe('technical');
  });

  it('python/데이터베이스 관련은 technical로 분류', () => {
    expect(categorizeMemory('python 스크립트로 데이터베이스 마이그레이션')).toBe('technical');
  });

  it('검색/분석 관련은 research로 분류', () => {
    expect(categorizeMemory('최신 AI 뉴스를 검색하고 분석')).toBe('research');
  });

  it('리서치/트렌드 관련은 research로 분류', () => {
    expect(categorizeMemory('리서치 결과와 트렌드 비교 논문')).toBe('research');
  });

  it('조사/비교 관련은 research로 분류', () => {
    expect(categorizeMemory('시장 조사 결과를 비교해봤습니다')).toBe('research');
  });

  it('선호/스타일 관련은 preference로 분류', () => {
    expect(categorizeMemory('사용자는 항상 간결한 스타일을 선호합니다')).toBe('preference');
  });

  it('규칙/컨벤션 관련은 preference로 분류', () => {
    expect(categorizeMemory('코딩 규칙과 컨벤션을 설정했습니다')).toBe('preference');
  });

  it('좋아/싫어 관련은 preference로 분류', () => {
    expect(categorizeMemory('이 방식이 좋아요')).toBe('preference');
  });

  it('일반 대화는 general로 분류', () => {
    expect(categorizeMemory('안녕하세요 오늘 날씨가 좋네요')).toBe('general');
  });

  it('빈 텍스트는 general로 분류', () => {
    expect(categorizeMemory('')).toBe('general');
  });

  it('여러 패턴이 있으면 첫 번째 매칭된 카테고리를 반환한다', () => {
    // technical 키워드가 먼저 매칭됨
    const result = categorizeMemory('React 컴포넌트를 검색하고 분석');
    expect(result).toBe('technical');
  });

  it('반환 타입이 MemoryCategory이다', () => {
    const result: MemoryCategory = categorizeMemory('test');
    expect(['technical', 'research', 'preference', 'general']).toContain(result);
  });
});
