export interface CommandArg {
  name: string;
  description: string;
  required: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  args?: CommandArg[];
  type: 'client' | 'server';
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'new', description: '새 대화 시작', type: 'client' },
  { name: 'clear', description: '현재 대화 메시지 초기화', type: 'client' },
  {
    name: 'model',
    description: '모델 전환',
    args: [{ name: 'name', description: '모델 이름', required: true }],
    type: 'client',
  },
  { name: 'help', description: '명령어 목록 표시', type: 'client' },
  { name: 'stats', description: '현재 세션 통계 표시', type: 'client' },
  {
    name: 'export',
    description: '현재 대화 내보내기',
    args: [{ name: 'format', description: 'json 또는 markdown', required: false }],
    type: 'server',
  },
  {
    name: 'system',
    description: '시스템 프롬프트 변경',
    args: [{ name: 'prompt', description: '새 시스템 프롬프트', required: true }],
    type: 'server',
  },
  {
    name: 'skill',
    description: '스킬 실행 (목록 표시 또는 실행)',
    args: [{ name: 'name', description: '스킬 트리거 커맨드', required: false }],
    type: 'client',
  },
];
