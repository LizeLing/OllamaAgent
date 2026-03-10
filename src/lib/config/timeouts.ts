/** 타임아웃 및 제한 상수 (매직 넘버 제거) */

export const TIMEOUTS = {
  /** 도구 승인 대기 (ms) */
  TOOL_APPROVAL: 60_000,
  /** 웹 검색 요청 (ms) */
  WEB_SEARCH: 10_000,
  /** 코드 실행 (ms) */
  CODE_EXECUTION: 30_000,
  /** MCP 도구 나열 (ms) */
  MCP_LIST_TOOLS: 10_000,
  /** MCP 도구 호출 (ms) */
  MCP_CALL_TOOL: 30_000,
  /** 웹훅 요청 (ms) */
  WEBHOOK_REQUEST: 5_000,
  /** 헬스 체크 (ms) */
  HEALTH_CHECK: 3_000,
  /** Ollama 임베딩 (ms) */
  EMBEDDING: 5_000,
  /** Docker ping (ms) */
  DOCKER_PING: 2_000,
  /** 크론 스케줄러 간격 (ms) */
  CRON_INTERVAL: 60_000,
} as const;

export const LIMITS = {
  /** 히스토리 컨텍스트 최대 문자 수 */
  MAX_HISTORY_CHARS: 16_000,
  /** Docker 컨테이너 메모리 (bytes) */
  DOCKER_MEMORY: 256 * 1024 * 1024,
  /** 대화 제목 최대 길이 */
  MAX_TITLE_LENGTH: 200,
  /** 메시지 최대 길이 */
  MAX_MESSAGE_LENGTH: 50_000,
  /** 대화당 최대 메시지 수 */
  MAX_MESSAGES_PER_CONVERSATION: 1_000,
  /** 검색 스니펫 앞뒤 여백 */
  SEARCH_SNIPPET_BEFORE: 30,
  SEARCH_SNIPPET_AFTER: 50,
} as const;
