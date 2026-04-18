import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig, AgentEvent, TaskWorkerContext } from '../types';

const runAgentLoopMock = vi.fn();
const registerTaskModeFilesystemToolsMock = vi.fn();

vi.mock('../agent-loop', () => ({
  runAgentLoop: (config: AgentConfig, userMessage: string, history: unknown[]) =>
    runAgentLoopMock(config, userMessage, history),
}));

vi.mock('@/lib/tools/init', () => ({
  registerTaskModeFilesystemTools: (
    cfg: AgentConfig,
    allowedPaths: string[],
    deniedPaths: string[],
  ) => registerTaskModeFilesystemToolsMock(cfg, allowedPaths, deniedPaths),
}));

import { parseWorkerResult, runSubAgent, runSubAgentStream, listSubAgentTypes } from '../subagent-runner';

function tokenStream(chunks: string[]): AsyncGenerator<AgentEvent> {
  async function* gen() {
    for (const content of chunks) {
      yield { type: 'token', data: { content } } as AgentEvent;
    }
  }
  return gen();
}

const baseParentConfig: AgentConfig = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'test-model',
  maxIterations: 3,
  systemPrompt: 'parent',
  allowedPaths: [],
  deniedPaths: [],
  toolApprovalMode: 'confirm',
  onToolApproval: vi.fn().mockResolvedValue(true),
};

describe('parseWorkerResult', () => {
  it('유효한 <worker-result> 태그에서 JSON을 파싱한다', () => {
    const raw = [
      '어쩌고저쩌고',
      '<worker-result>',
      JSON.stringify({
        status: 'completed',
        summary: '완료',
        completedSubtaskIds: ['s1'],
        changedFiles: ['/a/b.ts'],
        artifacts: ['/c.log'],
        followupSuggestions: ['다음 단계'],
      }),
      '</worker-result>',
    ].join('\n');

    const result = parseWorkerResult(raw, 'task_1');
    expect(result.taskId).toBe('task_1');
    expect(result.status).toBe('completed');
    expect(result.summary).toBe('완료');
    expect(result.completedSubtaskIds).toEqual(['s1']);
    expect(result.changedFiles).toEqual(['/a/b.ts']);
    expect(result.artifacts).toEqual(['/c.log']);
    expect(result.followupSuggestions).toEqual(['다음 단계']);
  });

  it('여러 <worker-result> 태그가 있으면 마지막 것을 사용한다', () => {
    const raw = [
      '<worker-result>',
      JSON.stringify({ status: 'blocked', summary: '초안', completedSubtaskIds: [], changedFiles: [] }),
      '</worker-result>',
      '최종:',
      '<worker-result>',
      JSON.stringify({ status: 'completed', summary: '최종', completedSubtaskIds: [], changedFiles: [] }),
      '</worker-result>',
    ].join('\n');
    const result = parseWorkerResult(raw, 'task_1');
    expect(result.summary).toBe('최종');
    expect(result.status).toBe('completed');
  });

  it('태그가 없으면 fallback을 반환한다', () => {
    const raw = '자유 텍스트 결과입니다';
    const result = parseWorkerResult(raw, 'task_x');
    expect(result.taskId).toBe('task_x');
    expect(result.status).toBe('completed');
    expect(result.summary).toBe('자유 텍스트 결과입니다');
    expect(result.completedSubtaskIds).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });

  it('태그 안의 JSON이 잘못되면 fallback으로 떨어진다', () => {
    const raw = '<worker-result>not json</worker-result>';
    const result = parseWorkerResult(raw, 'task_y');
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('not json');
  });

  it('알 수 없는 status는 completed로 보정한다', () => {
    const raw = `<worker-result>${JSON.stringify({ status: 'unknown', summary: 's' })}</worker-result>`;
    const result = parseWorkerResult(raw, 'task_z');
    expect(result.status).toBe('completed');
  });

  it('blocked status와 blocker를 보존한다', () => {
    const raw = `<worker-result>${JSON.stringify({
      status: 'blocked',
      summary: '의존성 없음',
      blocker: '외부 API 키 필요',
    })}</worker-result>`;
    const result = parseWorkerResult(raw, 'task_z');
    expect(result.status).toBe('blocked');
    expect(result.blocker).toBe('외부 API 키 필요');
  });

  it('배열이 아닌 필드는 무시하고 빈 배열로 대체한다', () => {
    const raw = `<worker-result>${JSON.stringify({
      status: 'completed',
      summary: 's',
      completedSubtaskIds: 'not-an-array',
      changedFiles: null,
    })}</worker-result>`;
    const result = parseWorkerResult(raw, 't');
    expect(result.completedSubtaskIds).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });
});

describe('listSubAgentTypes', () => {
  it('기본 3종을 포함한다', () => {
    const types = listSubAgentTypes();
    expect(types).toContain('coder');
    expect(types).toContain('researcher');
    expect(types).toContain('analyst');
  });

  it('verifier / planner 타입이 추가되었다', () => {
    const types = listSubAgentTypes();
    expect(types).toContain('verifier');
    expect(types).toContain('planner');
  });
});

describe('SUBAGENT_TYPES 확장 (verifier / planner 도구 제약)', () => {
  beforeEach(() => runAgentLoopMock.mockReset());

  it('verifier는 filesystem_write를 기본 enabledTools에 포함하지 않는다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['ok']));
    await runSubAgent(baseParentConfig, 'verifier', '테스트 실행', '');
    const [calledConfig] = runAgentLoopMock.mock.calls[0];
    expect(calledConfig.enabledTools).not.toContain('filesystem_write');
    expect(calledConfig.enabledTools).toContain('code_execute');
  });

  it('planner는 filesystem_write와 code_execute를 모두 제외한다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['ok']));
    await runSubAgent(baseParentConfig, 'planner', '리플랜 제안', '');
    const [calledConfig] = runAgentLoopMock.mock.calls[0];
    expect(calledConfig.enabledTools).not.toContain('filesystem_write');
    expect(calledConfig.enabledTools).not.toContain('code_execute');
    expect(calledConfig.enabledTools).toContain('filesystem_read');
  });
});

describe('runSubAgent (Task Mode 분기)', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
  });

  it('taskContext 없이 호출하면 자유 텍스트 결과만 반환한다 (기존 경로 회귀 없음)', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['자유 ', '텍스트 결과']));
    const { result, workerResult } = await runSubAgent(baseParentConfig, 'coder', '태스크', '컨텍스트');
    expect(result).toBe('자유 텍스트 결과');
    expect(workerResult).toBeUndefined();

    const [calledConfig] = runAgentLoopMock.mock.calls[0];
    expect(calledConfig.toolApprovalMode).toBe('auto');
    expect(calledConfig.onToolApproval).toBeUndefined();
    expect(calledConfig.taskContext).toBeUndefined();
    expect(calledConfig.systemPrompt).not.toContain('<worker-result>');
  });

  it('taskContext가 있으면 WorkerResult를 파싱하고 부모 승인 정책을 계승한다', async () => {
    const raw = `작업 완료.\n<worker-result>${JSON.stringify({
      status: 'completed',
      summary: '파일 작성 완료',
      completedSubtaskIds: ['s1', 's2'],
      changedFiles: ['/tmp/a.ts'],
    })}</worker-result>`;
    runAgentLoopMock.mockReturnValue(tokenStream([raw]));

    const taskContext: TaskWorkerContext = {
      taskId: 'task_1',
      taskItemId: 'item_1',
      writeScope: ['src/**/*.ts'],
      workerRole: 'coder',
    };

    const { workerResult } = await runSubAgent(baseParentConfig, 'coder', '태스크', '', taskContext);
    expect(workerResult).toBeDefined();
    expect(workerResult!.status).toBe('completed');
    expect(workerResult!.changedFiles).toEqual(['/tmp/a.ts']);
    expect(workerResult!.taskId).toBe('task_1');

    const [calledConfig] = runAgentLoopMock.mock.calls[0];
    expect(calledConfig.toolApprovalMode).toBe('confirm');
    expect(calledConfig.onToolApproval).toBe(baseParentConfig.onToolApproval);
    expect(calledConfig.taskContext).toEqual(taskContext);
    expect(calledConfig.systemPrompt).toContain('<worker-result>');
    expect(calledConfig.systemPrompt).toContain('taskId: task_1');
    expect(calledConfig.systemPrompt).toContain('writeScope');
  });

  it('taskContext.writeScope가 지정되면 registerTaskModeFilesystemTools가 호출된다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['']));
    registerTaskModeFilesystemToolsMock.mockReset();
    const taskContext: TaskWorkerContext = {
      taskId: 't',
      taskItemId: 'i',
      writeScope: ['src/**/*.ts'],
    };
    await runSubAgent(baseParentConfig, 'coder', '태스크', '', taskContext);
    expect(registerTaskModeFilesystemToolsMock).toHaveBeenCalledTimes(1);
    const [cfg, allowed, denied] = registerTaskModeFilesystemToolsMock.mock.calls[0];
    expect(cfg.taskContext).toEqual(taskContext);
    expect(allowed).toEqual(baseParentConfig.allowedPaths);
    expect(denied).toEqual(baseParentConfig.deniedPaths);
  });

  it('taskContext.writeScope가 undefined이면 registerTaskModeFilesystemTools를 호출하지 않는다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['']));
    registerTaskModeFilesystemToolsMock.mockReset();
    const taskContext: TaskWorkerContext = { taskId: 't', taskItemId: 'i' };
    await runSubAgent(baseParentConfig, 'coder', '태스크', '', taskContext);
    expect(registerTaskModeFilesystemToolsMock).not.toHaveBeenCalled();
  });

  it('taskContext.allowedTools와 타입 기본 enabledTools의 교집합을 적용한다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['']));
    const taskContext: TaskWorkerContext = {
      taskId: 't',
      taskItemId: 'i',
      allowedTools: ['filesystem_read', 'no_such_tool'],
    };
    await runSubAgent(baseParentConfig, 'coder', '태스크', '', taskContext);
    const [calledConfig] = runAgentLoopMock.mock.calls[0];
    expect(calledConfig.enabledTools).toEqual(['filesystem_read']);
  });

  it('Task Mode에서 WorkerResult 태그가 없으면 fallback으로 summary를 채운다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['태그 없는 결과']));
    const taskContext: TaskWorkerContext = { taskId: 't', taskItemId: 'i' };
    const { workerResult } = await runSubAgent(baseParentConfig, 'coder', '태스크', '', taskContext);
    expect(workerResult?.status).toBe('completed');
    expect(workerResult?.summary).toBe('태그 없는 결과');
  });

  it('알 수 없는 agent_type은 에러를 던진다', async () => {
    await expect(runSubAgent(baseParentConfig, 'no_such_type', 't', '')).rejects.toThrow(
      /Unknown subagent type/,
    );
  });

  it('maxNestingDepth를 초과하면 에러를 던진다', async () => {
    const deepConfig: AgentConfig = { ...baseParentConfig, nestingDepth: 2, maxNestingDepth: 2 };
    await expect(runSubAgent(deepConfig, 'coder', 't', '')).rejects.toThrow(
      /Max nesting depth/,
    );
  });
});

describe('runSubAgentStream (async generator)', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
  });

  it('subagent_start → subagent_token* → subagent_end → subagent_done 순서로 yield한다', async () => {
    runAgentLoopMock.mockReturnValue(tokenStream(['안녕', ' 세계']));
    const emitted: AgentEvent[] = [];
    for await (const evt of runSubAgentStream(baseParentConfig, 'coder', 'task', '')) {
      emitted.push(evt);
    }
    const types = emitted.map((e) => e.type);
    expect(types[0]).toBe('subagent_start');
    expect(types.filter((t) => t === 'subagent_token')).toHaveLength(2);
    expect(types.at(-2)).toBe('subagent_end');
    expect(types.at(-1)).toBe('subagent_done');

    const tokenContents = emitted
      .filter((e) => e.type === 'subagent_token')
      .map((e) => e.data.content);
    expect(tokenContents).toEqual(['안녕', ' 세계']);
  });

  it('Task Mode에서 subagent_done payload에 WorkerResult가 포함된다', async () => {
    const raw = `작업 완료.\n<worker-result>${JSON.stringify({
      status: 'completed',
      summary: '파일 작성 완료',
      completedSubtaskIds: ['s1'],
      changedFiles: ['/tmp/a.ts'],
    })}</worker-result>`;
    runAgentLoopMock.mockReturnValue(tokenStream([raw]));

    const taskContext: TaskWorkerContext = {
      taskId: 'task_42',
      taskItemId: 'item_1',
      workerRole: 'coder',
    };

    const collected: AgentEvent[] = [];
    for await (const evt of runSubAgentStream(baseParentConfig, 'coder', 'task', '', taskContext)) {
      collected.push(evt);
    }

    const done = collected.find((e) => e.type === 'subagent_done');
    expect(done).toBeDefined();
    const workerResult = done!.data.workerResult as { taskId: string; status: string; changedFiles: string[] };
    expect(workerResult).toBeDefined();
    expect(workerResult.taskId).toBe('task_42');
    expect(workerResult.status).toBe('completed');
    expect(workerResult.changedFiles).toEqual(['/tmp/a.ts']);

    const startEvt = collected.find((e) => e.type === 'subagent_start');
    expect(startEvt!.data.taskMode).toBe(true);
  });

  it('tool_start / tool_end / thinking_token이 subagent_* 타입으로 변환되어 yield된다', async () => {
    async function* mixedStream(): AsyncGenerator<AgentEvent> {
      yield { type: 'thinking_token', data: { content: '생각 중' } };
      yield { type: 'tool_start', data: { tool: 'filesystem_read', input: { path: '/a' } } };
      yield { type: 'token', data: { content: '결과' } };
      yield { type: 'tool_end', data: { tool: 'filesystem_read', output: 'data', success: true } };
    }
    runAgentLoopMock.mockReturnValue(mixedStream());

    const emitted: AgentEvent[] = [];
    for await (const evt of runSubAgentStream(baseParentConfig, 'coder', 'task', '')) {
      emitted.push(evt);
    }

    const types = emitted.map((e) => e.type);
    expect(types).toContain('subagent_thinking_token');
    expect(types).toContain('subagent_tool_start');
    expect(types).toContain('subagent_tool_end');

    const toolStart = emitted.find((e) => e.type === 'subagent_tool_start');
    expect(toolStart!.data.tool).toBe('filesystem_read');
    expect(toolStart!.data.agentType).toBe('coder');

    const toolEnd = emitted.find((e) => e.type === 'subagent_tool_end');
    expect(toolEnd!.data.success).toBe(true);
  });
});
