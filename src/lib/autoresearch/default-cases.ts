import { BenchmarkCase } from './types';

export const DEFAULT_BENCHMARK_CASES: BenchmarkCase[] = [
  // ─── 도구 선택 정확도 ───
  {
    id: 'tool-filesystem-read',
    category: 'tool_selection',
    query: '현재 프로젝트의 package.json 파일 내용을 읽어서 보여줘.',
    expectedTools: ['filesystem_read'],
    evaluationCriteria: 'filesystem_read 도구를 올바르게 선택하는지',
    weight: 1.5,
  },
  {
    id: 'tool-filesystem-list',
    category: 'tool_selection',
    query: '현재 프로젝트의 src 디렉토리 구조를 보여줘.',
    expectedTools: ['filesystem_list'],
    evaluationCriteria: 'filesystem_list 도구를 올바르게 선택하는지',
    weight: 1.5,
  },
  {
    id: 'tool-web-search',
    category: 'tool_selection',
    query: '2025년 노벨 물리학상 수상자가 누구인지 검색해줘.',
    expectedTools: ['web_search'],
    evaluationCriteria: 'web_search 도구를 올바르게 선택하는지',
    weight: 1.5,
  },
  {
    id: 'tool-code-execute',
    category: 'tool_selection',
    query: 'Python으로 1부터 100까지의 소수를 구하는 코드를 실행해줘.',
    expectedTools: ['code_execute'],
    evaluationCriteria: 'code_execute 도구를 올바르게 선택하는지',
    weight: 1.5,
  },

  // ─── 응답 품질 ───
  {
    id: 'quality-explanation',
    category: 'response_quality',
    query: 'TCP와 UDP의 차이점을 3가지 설명해줘.',
    expectedKeywords: ['TCP', 'UDP', '연결', '신뢰'],
    evaluationCriteria: '정확하고 구조적인 기술 설명을 한국어로 제공하는지',
    weight: 1.0,
    disableTools: true,
  },
  {
    id: 'quality-concise',
    category: 'response_quality',
    query: 'REST API란 무엇인지 한 문장으로 설명해줘.',
    expectedKeywords: ['REST', 'API', 'HTTP'],
    evaluationCriteria: '한 문장으로 간결하면서도 정확한 정의를 제공하는지',
    weight: 1.0,
    disableTools: true,
  },

  // ─── 추론 능력 ───
  {
    id: 'reasoning-math',
    category: 'reasoning',
    query: '어떤 수에 3을 곱하고 7을 더하면 25가 됩니다. 그 수는 무엇인가요?',
    expectedKeywords: ['6'],
    evaluationCriteria: '정답 6을 도출하고 풀이 과정을 보여주는지',
    weight: 1.0,
    disableTools: true,
  },
  {
    id: 'reasoning-logic',
    category: 'reasoning',
    query: 'A, B, C 세 사람이 있다. A는 B보다 키가 크고, C는 A보다 키가 크다. 가장 키가 작은 사람은?',
    expectedKeywords: ['B'],
    evaluationCriteria: '논리적 추론으로 B가 가장 작다는 결론을 도출하는지',
    weight: 1.0,
    disableTools: true,
  },

  // ─── 지시 따르기 ───
  {
    id: 'instruction-format',
    category: 'instruction_following',
    query: '다음 형식으로 자기소개를 해줘:\n이름: [이름]\n역할: [역할]\n특기: [특기]',
    expectedKeywords: ['이름:', '역할:', '특기:'],
    evaluationCriteria: '지정된 형식을 정확히 따르는지',
    weight: 1.2,
    disableTools: true,
  },
  {
    id: 'instruction-list',
    category: 'instruction_following',
    query: '프로그래밍 언어 5개를 번호 목록으로 나열해줘. 각 항목에 한 줄 설명을 추가해.',
    expectedKeywords: ['1.', '2.', '3.', '4.', '5.'],
    evaluationCriteria: '정확히 5개 항목을 번호 목록으로 제시하고 각각에 설명이 있는지',
    weight: 1.2,
    disableTools: true,
  },
];
