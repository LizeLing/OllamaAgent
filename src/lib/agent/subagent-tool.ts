import { BaseTool } from '@/lib/tools/base-tool';
import { ToolDefinition, AgentConfig, AgentEvent, TaskWorkerContext } from './types';
import { runSubAgent, listSubAgentTypes } from './subagent-runner';
import type { WorkerResult } from '@/types/task';

export class DelegateToSubAgentTool extends BaseTool {
  private eventBuffer: AgentEvent[] = [];
  private workerResults: WorkerResult[] = [];
  private parentConfig: AgentConfig;
  private taskContext?: TaskWorkerContext;

  definition: ToolDefinition = {
    name: 'delegate_to_subagent',
    description: '전문 서브에이전트에게 작업을 위임합니다. coder(코딩), researcher(리서치), analyst(분석) 타입을 선택할 수 있습니다.',
    parameters: [
      { name: 'task', type: 'string', description: '서브에이전트에게 위임할 작업 설명', required: true },
      { name: 'agent_type', type: 'string', description: '서브에이전트 타입', required: true },
      { name: 'context', type: 'string', description: '추가 컨텍스트 정보', required: false },
    ],
  };

  constructor(parentConfig: AgentConfig, taskContext?: TaskWorkerContext) {
    super();
    this.parentConfig = parentConfig;
    this.taskContext = taskContext;
    const types = listSubAgentTypes();
    this.definition.parameters[1].description = `서브에이전트 타입: ${types.map((t) => `"${t}"`).join(', ')}`;
  }

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; output: string }> {
    const task = args.task as string;
    const agentType = args.agent_type as string;
    const context = (args.context as string) || '';

    if (!task) return this.error('task is required');
    const allowedTypes = listSubAgentTypes();
    if (!allowedTypes.includes(agentType)) {
      return this.error(`agent_type must be one of: ${allowedTypes.map((t) => `"${t}"`).join(', ')}`);
    }

    try {
      const { result, events, workerResult } = await runSubAgent(
        this.parentConfig,
        agentType,
        task,
        context,
        this.taskContext
      );
      this.eventBuffer.push(...events);
      if (workerResult) this.workerResults.push(workerResult);
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

  /**
   * Task Mode에서 누적된 WorkerResult를 꺼낸다. 조회 후 버퍼는 비워진다.
   */
  drainWorkerResults(): WorkerResult[] {
    const results = [...this.workerResults];
    this.workerResults = [];
    return results;
  }
}
