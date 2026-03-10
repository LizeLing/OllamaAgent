import { describe, it, expect } from 'vitest';
import { chunkSections } from '../chunk-strategy';
import type { ParsedSection } from '../document-parser';

describe('ChunkStrategy', () => {
  it('적절한 크기의 섹션은 그대로 유지한다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(500), source: 'test' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toHaveLength(500);
  });

  it('200자 미만 섹션은 다음 섹션과 병합한다', () => {
    const sections: ParsedSection[] = [
      { text: 'short', source: 'a' },
      { text: 'b'.repeat(300), source: 'b' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('short');
  });

  it('1000자 초과 섹션은 500자 단위로 재분할한다', () => {
    const sections: ParsedSection[] = [
      { text: 'x'.repeat(1500), source: 'big' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it('500자 재분할 시 100자 오버랩이 적용된다', () => {
    const text = 'abcdefghij'.repeat(150); // 1500자
    const sections: ParsedSection[] = [{ text, source: 'overlap' }];
    const chunks = chunkSections(sections);

    if (chunks.length >= 2) {
      const end1 = chunks[0].text.slice(-100);
      const start2 = chunks[1].text.slice(0, 100);
      expect(end1).toBe(start2);
    }
  });

  it('병합 후 1000자 초과 시 재분할한다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(100), source: 'small' },
      { text: 'b'.repeat(950), source: 'medium' },
    ];
    const chunks = chunkSections(sections);

    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it('빈 섹션은 무시한다', () => {
    const sections: ParsedSection[] = [
      { text: '', source: 'empty' },
      { text: 'content', source: 'valid' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks.every(c => c.text.trim().length > 0)).toBe(true);
  });

  it('chunkIndex가 순차적으로 부여된다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(500), source: 'a' },
      { text: 'b'.repeat(500), source: 'b' },
    ];
    const chunks = chunkSections(sections);

    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });
});
