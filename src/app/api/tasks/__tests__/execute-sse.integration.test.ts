import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';
import type { AgentEvent } from '@/lib/agent/types';
import type { TaskRecord } from '@/types/task';

type RouteModule = typeof import('../[id]/execute/route');
type StorageModule = typeof import('@/lib/tasks/storage');

let cleanup: () => Promise<void>;
let dataDir: string;
let route: RouteModule;
let storage: StorageModule;

function makeTask(id: string): TaskRecord {
  const now = Date.now();
  return {
    id,
    title: 'Test Task',
    goal: '테스트 목표',
    mode: 'task',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    source: { type: 'prompt' },
    acceptanceCriteria: [],
    epics: [
      {
        id: 'epic_1',
        title: 'E1',
        description: '',
        status: 'todo',
        taskIds: ['item_1'],
      },
    ],
    tasks: [
      {
        id: 'item_1',
        epicId: 'epic_1',
        title: '첫 작업',
        description: '설명',
        status: 'todo',
        priority: 'medium',
        size: 'M',
        dependsOn: [],
        definitionOfDone: ['테스트 통과'],
        subtasks: [],
        owner: 'coder',
      },
    ],
    decisions: [],
    changedFiles: [],
    openQuestions: [],
  };
}

async function readSSE(response: Response): Promise<
  { event: string; data: Record<string, unknown> }[]
> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: { event: string; data: Record<string, unknown> }[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let ev = '';
      let data = '';
      for (const l of lines) {
        if (l.startsWith('event: ')) ev = l.slice(7);
        else if (l.startsWith('data: ')) data = l.slice(6);
      }
      if (ev && data) {
        try {
          events.push({ event: ev, data: JSON.parse(data) });
        } catch {
          events.push({ event: ev, data: {} });
        }
      }
    }
  }
  return events;
}

async function* streamEvents(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const e of events) {
    yield e;
  }
}

beforeEach(async () => {
  const setup = await setupTestDataDir();
  cleanup = setup.cleanup;
  dataDir = setup.dataDir;

  vi.resetModules();

  // Mock sub-agent runner & tool init BEFORE route import
  vi.doMock('@/lib/agent/subagent-runner', () => ({
    runSubAgentStream: vi.fn(),
  }));
  vi.doMock('@/lib/tools/init', () => ({
    initializeTools: vi.fn(async () => {}),
    registerCustomTools: vi.fn(),
    registerMcpTools: vi.fn(async () => {}),
  }));
  vi.doMock('@/lib/config/settings', () => ({
    loadSettings: vi.fn(async () => ({
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',
      embeddingModel: 'nomic-embed-text',
      maxIterations: 3,
      systemPrompt: '',
      allowedPaths: [dataDir],
      deniedPaths: [],
      searxngUrl: '',
      imageModel: '',
      toolApprovalMode: 'auto',
      customTools: [],
      mcpServers: [],
      enabledTools: [],
      modelOptions: null,
      fallbackModels: [],
      webSearchProvider: 'searxng',
      ollamaApiKey: '',
    })),
  }));

  route = await import('../[id]/execute/route');
  storage = await import('@/lib/tasks/storage');
});

afterEach(async () => {
  await cleanup();
  vi.resetModules();
  vi.doUnmock('@/lib/agent/subagent-runner');
  vi.doUnmock('@/lib/tools/init');
  vi.doUnmock('@/lib/config/settings');
});

describe('POST /api/tasks/[id]/execute — 실시간 SSE 중계', () => {
  it('Task 없으면 404 JSON 반환', async () => {
    const req = new NextRequest('http://localhost/api/tasks/nope/execute', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/찾을 수 없/);
  });

  it('선택 가능한 Task가 없으면 task_idle + done(status=idle)만 스트리밍', async () => {
    const task = makeTask('task_idle');
    // 모든 task를 done으로 변경하여 pickNextTask가 null 반환하도록
    task.tasks[0].status = 'done';
    await storage.createTask(task);

    const req = new NextRequest('http://localhost/api/tasks/task_idle/execute', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ id: 'task_idle' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await readSSE(res);
    const types = events.map((e) => e.event);
    expect(types).toContain('task_idle');
    expect(types[types.length - 1]).toBe('done');
    const lastDone = events[events.length - 1];
    expect(lastDone.data.status).toBe('idle');
  });

  it('선택된 Task 실행: subagent_* 이벤트가 실시간 순서대로 중계된다', async () => {
    const task = makeTask('task_exec');
    await storage.createTask(task);

    const agentEvents: AgentEvent[] = [
      { type: 'subagent_start', data: { agentType: 'coder', task: 't', depth: 1, taskMode: true } },
      { type: 'subagent_token', data: { agentType: 'coder', content: 'A' } },
      { type: 'subagent_token', data: { agentType: 'coder', content: 'B' } },
      {
        type: 'subagent_tool_start',
        data: { agentType: 'coder', tool: 'filesystem_read', input: { path: '/x' } },
      },
      {
        type: 'subagent_tool_end',
        data: { agentType: 'coder', tool: 'filesystem_read', output: 'ok', success: true },
      },
      { type: 'subagent_end', data: { agentType: 'coder', task: 't', resultLength: 2 } },
      {
        type: 'subagent_done',
        data: {
          agentType: 'coder',
          task: 't',
          resultLength: 2,
          result: 'AB',
          taskMode: true,
          workerResult: {
            taskId: 'task_exec',
            status: 'completed',
            summary: '완료',
            completedSubtaskIds: [],
            changedFiles: [],
          },
        },
      },
    ];

    const { runSubAgentStream } = (await import(
      '@/lib/agent/subagent-runner'
    )) as unknown as {
      runSubAgentStream: ReturnType<typeof vi.fn>;
    };
    runSubAgentStream.mockImplementation(() => streamEvents(agentEvents));

    const req = new NextRequest('http://localhost/api/tasks/task_exec/execute', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ id: 'task_exec' }) });

    const events = await readSSE(res);
    const types = events.map((e) => e.event);

    // 실제 이벤트 순서: task_pick → subagent_start → subagent_token × 2 → tool_start → tool_end → subagent_end → subagent_done → task_update → done
    expect(types[0]).toBe('task_pick');
    expect(types).toContain('subagent_start');
    expect(types).toContain('subagent_token');
    expect(types).toContain('subagent_tool_start');
    expect(types).toContain('subagent_tool_end');
    expect(types).toContain('subagent_end');
    expect(types).toContain('subagent_done');
    expect(types).toContain('task_update');
    expect(types[types.length - 1]).toBe('done');

    // 순서 보장: start < tool_start < tool_end < end < done
    const idx = (t: string) => types.indexOf(t);
    expect(idx('subagent_start')).toBeLessThan(idx('subagent_tool_start'));
    expect(idx('subagent_tool_start')).toBeLessThan(idx('subagent_tool_end'));
    expect(idx('subagent_tool_end')).toBeLessThan(idx('subagent_end'));
    expect(idx('subagent_end')).toBeLessThan(idx('subagent_done'));
  });

  it('workerResult가 없어도 failed fallback 후 task_update + done(executed) 이벤트 송출', async () => {
    const task = makeTask('task_nores');
    await storage.createTask(task);

    const agentEvents: AgentEvent[] = [
      { type: 'subagent_start', data: { agentType: 'coder', task: 't', depth: 1, taskMode: true } },
      { type: 'subagent_end', data: { agentType: 'coder', task: 't', resultLength: 0 } },
      {
        type: 'subagent_done',
        data: {
          agentType: 'coder',
          task: 't',
          resultLength: 0,
          result: '',
          taskMode: true,
        },
      },
    ];

    const { runSubAgentStream } = (await import(
      '@/lib/agent/subagent-runner'
    )) as unknown as { runSubAgentStream: ReturnType<typeof vi.fn> };
    runSubAgentStream.mockImplementation(() => streamEvents(agentEvents));

    const req = new NextRequest('http://localhost/api/tasks/task_nores/execute', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ id: 'task_nores' }) });

    const events = await readSSE(res);
    const update = events.find((e) => e.event === 'task_update');
    expect(update).toBeDefined();
    const wr = update!.data.workerResult as { status: string; blocker?: string };
    expect(wr.status).toBe('failed');
    expect(wr.blocker).toBe('no-worker-result');

    const last = events[events.length - 1];
    expect(last.event).toBe('done');
    expect(last.data.status).toBe('executed');
  });
});
