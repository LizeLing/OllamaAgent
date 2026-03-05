import { describe, it, expect } from 'vitest';
import { formatSSE } from '../streaming';

describe('formatSSE()', () => {
  it('event와 data를 올바른 SSE 형식으로 포맷한다', () => {
    const result = formatSSE('token', { content: 'hello' });
    expect(result).toBe('event: token\ndata: {"content":"hello"}\n\n');
  });

  it('복잡한 데이터 객체를 포맷한다', () => {
    const result = formatSSE('done', { iterations: 3, model: 'test' });
    expect(result).toContain('event: done\n');
    expect(result).toContain('data: ');
    expect(result.endsWith('\n\n')).toBe(true);
    const dataLine = result.split('\n')[1];
    const parsed = JSON.parse(dataLine.replace('data: ', ''));
    expect(parsed).toEqual({ iterations: 3, model: 'test' });
  });

  it('빈 데이터 객체를 처리한다', () => {
    const result = formatSSE('ping', {});
    expect(result).toBe('event: ping\ndata: {}\n\n');
  });
});
