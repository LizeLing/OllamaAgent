import { describe, expect, it } from 'vitest';
import { parseCommand, getCompletions } from '../registry';
import { COMMANDS } from '../definitions';

describe('parseCommand', () => {
  it('/new를 올바르게 파싱한다', () => {
    const result = parseCommand('/new');
    expect(result).toEqual({ name: 'new', args: [] });
  });

  it('/model qwen3를 올바르게 파싱한다', () => {
    const result = parseCommand('/model qwen3');
    expect(result).toEqual({ name: 'model', args: ['qwen3'] });
  });

  it('/system 여러 단어 인자를 올바르게 파싱한다', () => {
    const result = parseCommand('/system 새 프롬프트 설정입니다');
    expect(result).toEqual({ name: 'system', args: ['새 프롬프트 설정입니다'] });
  });

  it('일반 텍스트는 null을 반환한다', () => {
    const result = parseCommand('hello world');
    expect(result).toBeNull();
  });

  it('빈 문자열은 null을 반환한다', () => {
    const result = parseCommand('');
    expect(result).toBeNull();
  });

  it('알 수 없는 명령어는 null을 반환한다', () => {
    const result = parseCommand('/unknown');
    expect(result).toBeNull();
  });
});

describe('getCompletions', () => {
  it('/ 입력 시 전체 명령어 목록을 반환한다', () => {
    const result = getCompletions('/');
    expect(result).toEqual(COMMANDS);
    expect(result).toHaveLength(7);
  });

  it('/mo 입력 시 /model을 포함한다', () => {
    const result = getCompletions('/mo');
    expect(result.some((cmd) => cmd.name === 'model')).toBe(true);
  });

  it('/x 입력 시 빈 배열을 반환한다', () => {
    const result = getCompletions('/x');
    expect(result).toEqual([]);
  });
});
