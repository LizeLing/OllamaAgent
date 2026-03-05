import { COMMANDS, type CommandDefinition } from './definitions';

export interface ParsedCommand {
  name: string;
  args: string[];
}

/**
 * 사용자 입력을 파싱하여 명령어와 인자를 반환합니다.
 * - /로 시작하지 않으면 null
 * - COMMANDS에 등록되지 않은 명령어면 null
 * - 인자가 있으면 나머지 전체 문자열을 단일 요소 배열로 반환
 */
export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) {
    return null;
  }

  const trimmed = input.slice(1).trim();
  if (!trimmed) {
    return null;
  }

  const spaceIndex = trimmed.indexOf(' ');
  const commandName = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

  const found = COMMANDS.find((cmd) => cmd.name === commandName);
  if (!found) {
    return null;
  }

  return {
    name: found.name,
    args: rest ? [rest] : [],
  };
}

/**
 * 부분 입력에 대해 자동완성 후보 목록을 반환합니다.
 * - /로 시작하지 않으면 빈 배열
 * - /만 입력하면 전체 명령어 반환
 * - / 이후 부분 문자열로 startsWith 매칭
 */
export function getCompletions(input: string): CommandDefinition[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const partial = input.slice(1);
  return COMMANDS.filter((cmd) => cmd.name.startsWith(partial));
}
