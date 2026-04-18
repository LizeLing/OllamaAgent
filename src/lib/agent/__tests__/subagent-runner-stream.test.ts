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

import { runSubAgentStream } from '../subagent-runner';

function eventStream(chunks: AgentEvent[]): AsyncGenerator<AgentEvent> {
  async function* gen() {
    for (const evt of chunks) yield evt;
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

async function collect(
  gen: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const evt of gen) out.push(evt);
  return out;
}

describe('runSubAgentStream (async generator)', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    registerTaskModeFilesystemToolsMock.mockReset();
  });

  it('token 이벤트를 subagent_token으로 순서대로 yield한다', async () => {
    runAgentLoopMock.mockReturnValue(
      eventStream([
        { type: 'token', data: { content: '안녕' } },
        { type: 'token', data: { content: ', ' } },
        { type: 'token', data: { content: '월드' } },
      ]),
    );

    const events = await collect(
      runSubAgentStream(baseParentConfig, 'coder', '태스크', ''),
    );

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('subagent_start');
    const tokenEvents = events.filter((e) => e.type === 'subagent_token');
    expect(tokenEvents.map((e) => e.data.content)).toEqual(['안녕', ', ', '월드']);
    expect(types.at(-2)).toBe('subagent_end');
    expect(types.at(-1)).toBe('subagent_done');
  });

  it('tool_start / tool_end / thinking_token을 래핑된 타입으로 yield한다', async () => {
    runAgentLoopMock.mockReturnValue(
      eventStream([
        { type: 'thinking_token', data: { content: '생각 중', done: false } },
        { type: 'tool_start', data: { tool: 'fs_read', input: { path: '/a' } } },
        { type: 'tool_end', data: { tool: 'fs_read', output: 'ok', success: true } },
        { type: 'token', data: { content: '완료' } },
      ]),
    );

    const events = await collect(
      runSubAgentStream(baseParentConfig, 'coder', '태스크', ''),
    );

    const wrapped = events.filter((e) =>
      ['subagent_thinking_token', 'subagent_tool_start', 'subagent_tool_end'].includes(e.type),
    );
    expect(wrapped.map((e) => e.type)).toEqual([
      'subagent_thinking_token',
      'subagent_tool_start',
      'subagent_tool_end',
    ]);
    // agentType이 data에 첨부되어야 한다
    for (const e of wrapped) expect(e.data.agentType).toBe('coder');
  });

  it('Task Mode(taskContext 지정)에서 subagent_done payload에 workerResult가 포함된다', async () => {
    const raw = `결과입니다.\n<worker-result>${JSON.stringify({
      status: 'completed',
      summary: '파일 수정 완료',
      completedSubtaskIds: ['s1'],
      changedFiles: ['/tmp/a.ts'],
    })}</worker-result>`;

    runAgentLoopMock.mockReturnValue(
      eventStream([{ type: 'token', data: { content: raw } }]),
    );

    const taskContext: TaskWorkerContext = {
      taskId: 'task_abc',
      taskItemId: 'item_1',
      workerRole: 'coder',
    };

    const events = await collect(
      runSubAgentStream(baseParentConfig, 'coder', '태스크', '', taskContext),
    );
    const done = events.find((e) => e.type === 'subagent_done');
    expect(done).toBeDefined();
    expect(done!.data.taskMode).toBe(true);
    const wr = done!.data.workerResult as { status: string; changedFiles: string[]; taskId: string };
    expect(wr).toBeDefined();
    expect(wr.status).toBe('completed');
    expect(wr.taskId).toBe('task_abc');
    expect(wr.changedFiles).toEqual(['/tmp/a.ts']);
  });

  it('taskContext가 없으면 subagent_done에 workerResult가 존재하지 않는다 (회귀 방지)', async () => {
    runAgentLoopMock.mockReturnValue(
      eventStream([{ type: 'token', data: { content: '자유 텍스트' } }]),
    );

    const events = await collect(
      runSubAgentStream(baseParentConfig, 'coder', '태스크', ''),
    );
    const done = events.find((e) => e.type === 'subagent_done');
    expect(done).toBeDefined();
    expect(done!.data.taskMode).toBe(false);
    expect(done!.data.workerResult).toBeUndefined();
  });

  it('subagent_start / subagent_end / subagent_done 순서가 보장된다', async () => {
    runAgentLoopMock.mockReturnValue(
      eventStream([{ type: 'token', data: { content: 'x' } }]),
    );

    const events = await collect(
      runSubAgentStream(baseParentConfig, 'analyst', 't', ''),
    );
    const types = events.map((e) => e.type);
    const startIdx = types.indexOf('subagent_start');
    const endIdx = types.indexOf('subagent_end');
    const doneIdx = types.indexOf('subagent_done');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    expect(doneIdx).toBe(types.length - 1);
  });

  it('잘못된 agent_type은 yield 시작 전에 즉시 에러를 던진다', async () => {
    const gen = runSubAgentStream(baseParentConfig, 'unknown_type', 't', '');
    await expect(gen.next()).rejects.toThrow(/Unknown subagent type/);
  });

  it('maxNestingDepth 초과 시 에러를 던진다', async () => {
    const deepConfig: AgentConfig = { ...baseParentConfig, nestingDepth: 2, maxNestingDepth: 2 };
    const gen = runSubAgentStream(deepConfig, 'coder', 't', '');
    await expect(gen.next()).rejects.toThrow(/Max nesting depth/);
  });

  it('Task Mode + writeScope 지정 시 registerTaskModeFilesystemTools가 호출된다', async () => {
    runAgentLoopMock.mockReturnValue(eventStream([{ type: 'token', data: { content: '' } }]));
    const taskContext: TaskWorkerContext = {
      taskId: 't',
      taskItemId: 'i',
      writeScope: ['src/**/*.ts'],
    };
    await collect(runSubAgentStream(baseParentConfig, 'coder', '태스크', '', taskContext));
    expect(registerTaskModeFilesystemToolsMock).toHaveBeenCalledTimes(1);
  });

  it('결과 길이가 8000자를 초과하면 잘라서 resultLength가 보고된다', async () => {
    const big = 'a'.repeat(9000);
    runAgentLoopMock.mockReturnValue(eventStream([{ type: 'token', data: { content: big } }]));
    const events = await collect(runSubAgentStream(baseParentConfig, 'coder', 't', ''));
    const done = events.find((e) => e.type === 'subagent_done');
    expect(done).toBeDefined();
    expect((done!.data.resultLength as number)).toBeLessThanOrEqual(8050);
    const resultStr = done!.data.result as string;
    expect(resultStr).toContain('... (결과가 잘렸습니다)');
  });
});
