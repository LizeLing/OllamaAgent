import { AgentConfig, AgentEvent, TaskWorkerContext } from './types';
import { runAgentLoop } from './agent-loop';
import { registerTaskModeFilesystemTools } from '@/lib/tools/init';
import type { WorkerResult, WorkerResultStatus } from '@/types/task';

const SUBAGENT_TYPES: Record<string, { systemPrompt: string; enabledTools: string[]; maxIterations: number }> = {
  coder: {
    systemPrompt: '당신은 코딩 전문 서브에이전트입니다. 파일 시스템을 탐색하고 코드를 작성/수정/실행합니다.',
    enabledTools: ['filesystem_read', 'filesystem_write', 'filesystem_list', 'filesystem_search', 'code_execute'],
    maxIterations: 8,
  },
  researcher: {
    systemPrompt: '당신은 리서치 전문 서브에이전트입니다. 웹 검색과 HTTP 요청으로 정보를 수집하고 분석합니다.',
    enabledTools: ['web_search', 'http_request', 'filesystem_read'],
    maxIterations: 6,
  },
  analyst: {
    systemPrompt: '당신은 데이터 분석 전문 서브에이전트입니다. 파일을 읽고 코드를 실행하여 데이터를 분석합니다.',
    enabledTools: ['filesystem_read', 'filesystem_list', 'code_execute'],
    maxIterations: 6,
  },
  verifier: {
    systemPrompt: [
      '당신은 검증 전문 서브에이전트입니다. 코드 변경 이후의 테스트 실행, 회귀 확인, Definition of Done 충족 여부만 판단합니다.',
      '파일을 직접 수정하지 않습니다. 테스트 실행과 읽기 전용 조사만 수행하세요.',
      '검증 결과는 통과/실패/회귀 의심 여부를 명확히 구분해 보고하세요.',
    ].join('\n'),
    enabledTools: ['filesystem_read', 'filesystem_list', 'filesystem_search', 'code_execute'],
    maxIterations: 6,
  },
  planner: {
    systemPrompt: [
      '당신은 계획 정제 서브에이전트입니다. 현재 Task 상태와 컨텍스트를 읽어 제한적인 replan 또는 task refinement만 수행합니다.',
      '코드를 수정하거나 외부 시스템을 변경하지 않습니다. 제안은 자연어 또는 구조화된 문서 형태로만 반환하세요.',
      '기존 Task ID는 최대한 유지하고, 제안 사유를 명시하세요.',
    ].join('\n'),
    enabledTools: ['filesystem_read', 'filesystem_list', 'filesystem_search'],
    maxIterations: 4,
  },
};

export function listSubAgentTypes(): string[] {
  return Object.keys(SUBAGENT_TYPES);
}

const WORKER_RESULT_REGEX = /<worker-result>([\s\S]*?)<\/worker-result>/g;

const WORKER_RESULT_INSTRUCTION = [
  '',
  '## Task Mode 결과 반환 규칙',
  '작업을 마치면 반드시 마지막에 다음 형식의 JSON을 <worker-result> 태그로 감싸 반환하세요.',
  '예시 외에는 태그를 쓰지 마세요. 최종 태그 1개만 파싱 대상입니다.',
  '',
  '<worker-result>',
  '{',
  '  "status": "completed | blocked | failed",',
  '  "summary": "한 줄 요약",',
  '  "completedSubtaskIds": ["id1", "id2"],',
  '  "changedFiles": ["절대경로 또는 상대경로"],',
  '  "artifacts": ["선택적 산출물 경로"],',
  '  "blocker": "blocked/failed인 경우 이유",',
  '  "followupSuggestions": ["후속 제안"]',
  '}',
  '</worker-result>',
].join('\n');

function buildTaskContextSection(ctx: TaskWorkerContext): string {
  const lines = ['', '## Task 컨텍스트', `- taskId: ${ctx.taskId}`, `- taskItemId: ${ctx.taskItemId}`];
  if (ctx.workerRole) lines.push(`- role: ${ctx.workerRole}`);
  if (ctx.writeScope && ctx.writeScope.length > 0) {
    lines.push(`- writeScope (이 glob 범위 밖으로는 파일을 쓸 수 없음): ${ctx.writeScope.join(', ')}`);
  }
  if (ctx.allowedTools && ctx.allowedTools.length > 0) {
    lines.push(`- allowedTools: ${ctx.allowedTools.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * rawText에서 마지막 <worker-result>...</worker-result> 블록을 찾아 WorkerResult로 파싱한다.
 * 파싱 실패 시 { status: 'completed', summary: rawText, ... } fallback 반환.
 */
export function parseWorkerResult(rawText: string, taskId: string): WorkerResult {
  const matches = Array.from(rawText.matchAll(WORKER_RESULT_REGEX));
  if (matches.length > 0) {
    const body = matches[matches.length - 1][1].trim();
    try {
      const parsed = JSON.parse(body) as Partial<WorkerResult>;
      const status: WorkerResultStatus =
        parsed.status === 'blocked' || parsed.status === 'failed' ? parsed.status : 'completed';
      return {
        taskId,
        status,
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        completedSubtaskIds: Array.isArray(parsed.completedSubtaskIds)
          ? parsed.completedSubtaskIds.filter((x): x is string => typeof x === 'string')
          : [],
        changedFiles: Array.isArray(parsed.changedFiles)
          ? parsed.changedFiles.filter((x): x is string => typeof x === 'string')
          : [],
        artifacts: Array.isArray(parsed.artifacts)
          ? parsed.artifacts.filter((x): x is string => typeof x === 'string')
          : undefined,
        blocker: typeof parsed.blocker === 'string' ? parsed.blocker : undefined,
        followupSuggestions: Array.isArray(parsed.followupSuggestions)
          ? parsed.followupSuggestions.filter((x): x is string => typeof x === 'string')
          : undefined,
      };
    } catch {
      // JSON 파싱 실패 → fallback
    }
  }
  return {
    taskId,
    status: 'completed',
    summary: rawText.trim(),
    completedSubtaskIds: [],
    changedFiles: [],
  };
}

/**
 * 서브에이전트 실행을 async generator로 스트리밍한다.
 * yield되는 이벤트 순서:
 *   subagent_start
 *   → subagent_token* / subagent_thinking_token* / subagent_tool_start / subagent_tool_end / subagent_event*
 *   → subagent_end
 *   → subagent_done (payload에 workerResult, result 포함)
 */
export async function* runSubAgentStream(
  parentConfig: AgentConfig,
  agentType: string,
  task: string,
  context: string,
  taskContext?: TaskWorkerContext
): AsyncGenerator<AgentEvent> {
  const typeConfig = SUBAGENT_TYPES[agentType];
  if (!typeConfig) throw new Error(`Unknown subagent type: ${agentType}`);

  const depth = (parentConfig.nestingDepth || 0) + 1;
  const maxDepth = parentConfig.maxNestingDepth || 2;
  if (depth > maxDepth) throw new Error(`Max nesting depth (${maxDepth}) exceeded`);

  const isTaskMode = Boolean(taskContext);

  // Task Mode: allowedTools가 있으면 교집합 적용
  const enabledTools =
    isTaskMode && taskContext?.allowedTools && taskContext.allowedTools.length > 0
      ? typeConfig.enabledTools.filter((t) => taskContext.allowedTools!.includes(t))
      : typeConfig.enabledTools;

  const systemPromptParts = [typeConfig.systemPrompt];
  if (context) systemPromptParts.push(`\n\n## 컨텍스트\n${context}`);
  if (isTaskMode && taskContext) {
    systemPromptParts.push(buildTaskContextSection(taskContext));
    systemPromptParts.push(WORKER_RESULT_INSTRUCTION);
  }

  const subConfig: AgentConfig = {
    ...parentConfig,
    systemPrompt: systemPromptParts.join(''),
    enabledTools,
    maxIterations: typeConfig.maxIterations,
    // Task Mode: 부모 승인 정책 계승 (명시적 override 없이 auto 강제 금지)
    toolApprovalMode: isTaskMode
      ? parentConfig.toolApprovalMode ?? 'auto'
      : 'auto',
    onToolApproval: isTaskMode ? parentConfig.onToolApproval : undefined,
    nestingDepth: depth,
    maxNestingDepth: maxDepth,
    activeSkill: undefined,
    taskContext,
  };

  // Task Mode: writeScope가 지정되어 있으면 filesystem_write를 scope-aware 인스턴스로 교체
  if (isTaskMode && taskContext?.writeScope !== undefined) {
    registerTaskModeFilesystemTools(subConfig, parentConfig.allowedPaths, parentConfig.deniedPaths);
  }

  let result = '';

  yield { type: 'subagent_start', data: { agentType, task, depth, taskMode: isTaskMode } };

  for await (const event of runAgentLoop(subConfig, task, [])) {
    if (event.type === 'token') {
      result += event.data.content as string;
      yield { type: 'subagent_token', data: { agentType, content: event.data.content } };
      continue;
    }
    if (event.type === 'thinking_token') {
      yield {
        type: 'subagent_thinking_token',
        data: { agentType, ...event.data },
      };
      continue;
    }
    if (event.type === 'tool_start') {
      yield { type: 'subagent_tool_start', data: { agentType, ...event.data } };
      continue;
    }
    if (event.type === 'tool_end') {
      yield { type: 'subagent_tool_end', data: { agentType, ...event.data } };
      continue;
    }
    // 나머지 이벤트는 subagent_event 래퍼로 그대로 흘려보낸다 (기존 포맷 유지)
    yield { type: 'subagent_event', data: { agentType, originalEvent: event.type, ...event.data } };
  }

  // 결과 길이 제한 (기존 동작 유지)
  if (result.length > 8000) {
    result = result.slice(0, 8000) + '\n\n... (결과가 잘렸습니다)';
  }

  yield { type: 'subagent_end', data: { agentType, task, resultLength: result.length } };

  let workerResult: WorkerResult | undefined;
  if (isTaskMode && taskContext) {
    workerResult = parseWorkerResult(result, taskContext.taskId);
  }

  yield {
    type: 'subagent_done',
    data: {
      agentType,
      task,
      resultLength: result.length,
      result,
      taskMode: isTaskMode,
      ...(workerResult ? { workerResult } : {}),
    },
  };
}

function stripAgentType(data: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (key !== 'agentType') rest[key] = data[key];
  }
  return rest;
}

/**
 * 기존 호출자 호환용 어댑터. runSubAgentStream을 수집해 배열로 반환한다.
 * 반환되는 events 배열은 기존 포맷(subagent_start / subagent_event / subagent_end)으로 정규화하여
 * 채팅 경로(agent-loop.drainEvents)의 회귀를 방지한다.
 */
export async function runSubAgent(
  parentConfig: AgentConfig,
  agentType: string,
  task: string,
  context: string,
  taskContext?: TaskWorkerContext
): Promise<{ result: string; events: AgentEvent[]; workerResult?: WorkerResult }> {
  const events: AgentEvent[] = [];
  let result = '';
  let workerResult: WorkerResult | undefined;

  for await (const evt of runSubAgentStream(parentConfig, agentType, task, context, taskContext)) {
    switch (evt.type) {
      case 'subagent_start':
      case 'subagent_end':
        events.push(evt);
        break;
      case 'subagent_token':
        events.push({
          type: 'subagent_event',
          data: { agentType, originalEvent: 'token', content: evt.data.content },
        });
        break;
      case 'subagent_thinking_token': {
        const rest = stripAgentType(evt.data);
        events.push({
          type: 'subagent_event',
          data: { agentType, originalEvent: 'thinking_token', ...rest },
        });
        break;
      }
      case 'subagent_tool_start': {
        const rest = stripAgentType(evt.data);
        events.push({
          type: 'subagent_event',
          data: { agentType, originalEvent: 'tool_start', ...rest },
        });
        break;
      }
      case 'subagent_tool_end': {
        const rest = stripAgentType(evt.data);
        events.push({
          type: 'subagent_event',
          data: { agentType, originalEvent: 'tool_end', ...rest },
        });
        break;
      }
      case 'subagent_event':
        events.push(evt);
        break;
      case 'subagent_done':
        result = (evt.data.result as string) ?? '';
        workerResult = evt.data.workerResult as WorkerResult | undefined;
        break;
      default:
        events.push(evt);
    }
  }

  return workerResult ? { result, events, workerResult } : { result, events };
}
