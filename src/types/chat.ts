/**
 * Plan 모드 관련 타입.
 *
 * Plan 모드에서는 파일 쓰기/쉘 도구가 차단되고, 에이전트는 실행 계획(plan)만 생성한다.
 * 클라이언트는 plan을 받아 PlanApprovalModal에 표시하고, 사용자가 승인 시
 * planMode=false로 동일 요청을 재호출하여 실제 실행을 수행한다.
 */

export interface PlanEvent {
  /** 전체 plan 텍스트 */
  plan: string;
  /** plan 모드 중 에이전트가 호출하려 했으나 차단된 도구 이름 목록 */
  blockedTools?: string[];
  /** 사용된 모델 */
  model?: string;
}

export interface PlanApproval {
  /** 승인할 plan 내용 */
  plan: string;
  /** plan을 실행하기 위한 원본 사용자 메시지 */
  userMessage: string;
}

/** Plan 모드에서 항상 차단되는 쓰기/실행 계열 도구 이름. */
export const PLAN_MODE_BLOCKED_TOOLS: readonly string[] = [
  'filesystem_write',
  'code_execute',
  'image_generate',
] as const;
