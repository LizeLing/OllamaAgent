/**
 * 구조화된 메모리 스키마
 *
 * 메모리를 카테고리별로 분류하고 가중치/유효기간을 적용하여
 * 검색 품질을 향상시킨다.
 */

export type MemoryCategory = 'technical' | 'research' | 'preference' | 'general';

export const MEMORY_CATEGORIES: Record<MemoryCategory, { weight: number; maxAge: number }> = {
  technical: { weight: 1.2, maxAge: 60 },   // 60일
  research: { weight: 1.0, maxAge: 30 },    // 30일
  preference: { weight: 1.5, maxAge: 90 },  // 90일
  general: { weight: 0.8, maxAge: 14 },     // 14일
};

const CATEGORY_PATTERNS: { category: MemoryCategory; keywords: RegExp }[] = [
  {
    category: 'technical',
    keywords: /코드|함수|컴포넌트|API|버그|에러|타입|클래스|데이터베이스|서버|배포|git|react|typescript|python|docker/i,
  },
  {
    category: 'research',
    keywords: /검색|조사|분석|리서치|뉴스|트렌드|논문|비교|최신/i,
  },
  {
    category: 'preference',
    keywords: /선호|항상|싫어|좋아|스타일|방식|규칙|컨벤션|설정/i,
  },
];

/**
 * 텍스트 내용을 기반으로 메모리 카테고리를 분류한다.
 * 키워드 패턴 매칭으로 우선순위 순서대로 검사하며,
 * 매칭되는 패턴이 없으면 'general'을 반환한다.
 */
export function categorizeMemory(text: string): MemoryCategory {
  for (const { category, keywords } of CATEGORY_PATTERNS) {
    if (keywords.test(text)) return category;
  }
  return 'general';
}
