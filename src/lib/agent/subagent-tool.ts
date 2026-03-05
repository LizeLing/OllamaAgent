import { BaseTool } from '@/lib/tools/base-tool';
import { ToolDefinition, AgentConfig, AgentEvent } from './types';
import { runSubAgent } from './subagent-runner';

export class DelegateToSubAgentTool extends BaseTool {
  private eventBuffer: AgentEvent[] = [];
  private parentConfig: AgentConfig;

  definition: ToolDefinition = {
    name: 'delegate_to_subagent',
    description: '전문 서브에이전트에게 작업을 위임합니다. coder(코딩), researcher(리서치), analyst(분석) 타입을 선택할 수 있습니다.',
    parameters: [
      { name: 'task', type: 'string', description: '서브에이전트에게 위임할 작업 설명', required: true },
      { name: 'agent_type', type: 'string', description: '서브에이전트 타입: "coder", "researcher", "analyst"', required: true },
      { name: 'context', type: 'string', description: '추가 컨텍스트 정보', required: false },
    ],
  };

  constructor(parentConfig: AgentConfig) {
    super();
    this.parentConfig = parentConfig;
  }

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; output: string }> {
    const task = args.task as string;
    const agentType = args.agent_type as string;
    const context = (args.context as string) || '';

    if (!task) return this.error('task is required');
    if (!['coder', 'researcher', 'analyst'].includes(agentType)) {
      return this.error('agent_type must be "coder", "researcher", or "analyst"');
    }

    try {
      const { result, events } = await runSubAgent(this.parentConfig, agentType, task, context);
      this.eventBuffer.push(...events);
      return this.success(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return this.error(`SubAgent failed: ${msg}`);
    }
  }

  drainEvents(): AgentEvent[] {
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    return events;
  }
}
