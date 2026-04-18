import { describe, it, expect } from 'vitest';
import { scoreToolAccuracy, scoreKeywords } from '../evaluator';

describe('scoreToolAccuracy', () => {
  it('기대 도구와 실제 도구가 동일하면 100', () => {
    expect(scoreToolAccuracy(['web_search'], ['web_search'])).toBe(100);
  });

  it('기대 도구 중 일부만 호출하면 부분 점수', () => {
    expect(scoreToolAccuracy(['web_search', 'filesystem_read'], ['web_search'])).toBe(50);
  });

  it('기대 도구가 없고 실제도 없으면 100', () => {
    expect(scoreToolAccuracy([], [])).toBe(100);
  });

  it('기대 도구가 없는데 호출하면 70 (약간 감점)', () => {
    expect(scoreToolAccuracy([], ['web_search'])).toBe(70);
  });

  it('기대 도구가 있는데 호출 안 하면 0', () => {
    expect(scoreToolAccuracy(['web_search'], [])).toBe(0);
  });

  it('완전히 다른 도구를 호출하면 0', () => {
    expect(scoreToolAccuracy(['web_search'], ['filesystem_read'])).toBe(0);
  });

  it('기대 도구 + 추가 도구 호출 시 Jaccard 반영', () => {
    // intersection = 1, union = 2 → 50%
    expect(scoreToolAccuracy(['web_search'], ['web_search', 'filesystem_read'])).toBe(50);
  });
});

describe('scoreKeywords', () => {
  it('모든 키워드가 포함되면 100', () => {
    expect(scoreKeywords(['TCP', 'UDP'], 'TCP와 UDP의 차이')).toBe(100);
  });

  it('일부 키워드만 포함되면 비율 반환', () => {
    expect(scoreKeywords(['TCP', 'UDP', 'HTTP'], 'TCP 프로토콜')).toBe(33);
  });

  it('키워드가 없으면 100 (기본값)', () => {
    expect(scoreKeywords([], '아무 응답')).toBe(100);
  });

  it('대소문자 무시', () => {
    expect(scoreKeywords(['rest', 'API'], 'REST api 설명')).toBe(100);
  });

  it('키워드가 하나도 없으면 0', () => {
    expect(scoreKeywords(['특수키워드'], '전혀 관련없는 응답')).toBe(0);
  });
});
