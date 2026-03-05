import { AgentConfig, AgentEvent } from './types';
import { runAgentLoop } from './agent-loop';

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
};

export async function runSubAgent(
  parentConfig: AgentConfig,
  agentType: string,
  task: string,
  context: string
): Promise<{ result: string; events: AgentEvent[] }> {
  const typeConfig = SUBAGENT_TYPES[agentType];
  if (!typeConfig) throw new Error(`Unknown subagent type: ${agentType}`);

  const depth = (parentConfig.nestingDepth || 0) + 1;
  const maxDepth = parentConfig.maxNestingDepth || 2;
  if (depth > maxDepth) throw new Error(`Max nesting depth (${maxDepth}) exceeded`);

  const subConfig: AgentConfig = {
    ...parentConfig,
    systemPrompt: typeConfig.systemPrompt + (context ? `\n\n## 컨텍스트\n${context}` : ''),
    enabledTools: typeConfig.enabledTools,
    maxIterations: typeConfig.maxIterations,
    toolApprovalMode: 'auto',
    onToolApproval: undefined,
    nestingDepth: depth,
    maxNestingDepth: maxDepth,
    activeSkill: undefined,
  };

  const events: AgentEvent[] = [];
  let result = '';

  events.push({ type: 'subagent_start', data: { agentType, task, depth } });

  for await (const event of runAgentLoop(subConfig, task, [])) {
    if (event.type === 'token') {
      result += event.data.content as string;
    }
    events.push({ type: 'subagent_event', data: { agentType, originalEvent: event.type, ...event.data } });
  }

  // Limit result length
  if (result.length > 8000) {
    result = result.slice(0, 8000) + '\n\n... (결과가 잘렸습니다)';
  }

  events.push({ type: 'subagent_end', data: { agentType, task, resultLength: result.length } });

  return { result, events };
}
