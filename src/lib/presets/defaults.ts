import { AgentPreset } from '@/types/settings';

export const DEFAULT_PRESETS: AgentPreset[] = [
  {
    id: 'coding',
    name: '코딩 어시스턴트',
    systemPrompt: '당신은 숙련된 소프트웨어 개발자입니다. 코드를 작성하고, 디버깅하고, 리팩토링하는 데 도움을 줍니다. 한국어로 응답하세요.',
    enabledTools: ['filesystem_read', 'filesystem_write', 'filesystem_list', 'filesystem_search', 'code_execute'],
  },
  {
    id: 'research',
    name: '리서치',
    systemPrompt: '당신은 정보 검색과 분석에 특화된 리서치 어시스턴트입니다. 웹 검색과 자료 분석으로 정확한 정보를 제공합니다. 한국어로 응답하세요.',
    enabledTools: ['web_search', 'http_request', 'filesystem_read'],
  },
  {
    id: 'general',
    name: '일반',
    systemPrompt: '당신은 유능한 AI 어시스턴트입니다. 사용자의 질문에 정확하고 도움이 되는 답변을 제공합니다. 한국어로 응답하세요.',
    enabledTools: [],
  },
];
