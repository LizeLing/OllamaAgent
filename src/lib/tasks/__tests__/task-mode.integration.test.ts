import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';
import type {
  BreakdownDraft,
  ParsedEpicDraft,
  ParsedTaskDraft,
} from '../breakdown-engine';
import type { TaskRecord, WorkerResult } from '@/types/task';

let cleanup: () => Promise<void>;
let dataDir: string;

type TasksModule = typeof import('../storage');
type BreakdownModule = typeof import('../breakdown-engine');
type CoordinatorModule = typeof import('../coordinator');
type CheckpointModule = typeof import('../checkpoint');
type MarkdownModule = typeof import('../markdown');
type ContextModule = typeof import('../context-builder');

let storage: TasksModule;
let breakdown: BreakdownModule;
let coordinator: CoordinatorModule;
let checkpoint: CheckpointModule;
let markdown: MarkdownModule;
let context: ContextModule;

async function reloadModules() {
  vi.resetModules();
  storage = await import('../storage');
  breakdown = await import('../breakdown-engine');
  coordinator = await import('../coordinator');
  checkpoint = await import('../checkpoint');
  markdown = await import('../markdown');
  context = await import('../context-builder');
}

function makeDraft(): BreakdownDraft {
  const epics: ParsedEpicDraft[] = [
    { title: '저장소 초석', description: 'Task 기반 저장소 구축' },
    { title: '재개 흐름', description: '재개/체크포인트 구현' },
  ];
  const tasks: ParsedTaskDraft[] = [
    {
      epicIndex: 0,
      title: '스토리지 구현',
      description: 'atomic + file-lock 기반 저장소',
      priority: 'high',
      size: 'M',
      owner: 'coder',
      dependsOn: [],
      definitionOfDone: ['test:unit 통과'],
      subtasks: ['경로 검증', '인덱스 갱신'],
    },
    {
      epicIndex: 0,
      title: 'Markdown 렌더러',
      description: '',
      priority: 'medium',
      size: 'S',
      owner: 'coder',
      dependsOn: [0],
      definitionOfDone: [],
      subtasks: [],
    },
    {
      epicIndex: 1,
      title: '재개 컨텍스트 빌더',
      description: '',
      priority: 'medium',
      size: 'M',
      owner: 'coder',
      dependsOn: [0, 1],
      definitionOfDone: [],
      subtasks: [],
    },
  ];
  return {
    title: 'Task Mode 구현',
    goal: 'Task 저장 + 재개 흐름 완성',
    acceptanceCriteria: ['Task가 저장된다', '재개가 동작한다'],
    epics,
    tasks,
  };
}

describe('Task Mode E2E (file-backed)', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    dataDir = setup.dataDir;
    cleanup = setup.cleanup;
    await reloadModules();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('breakdown draft → createTask → task.json/task.md 저장, 인덱스 반영', async () => {
    const draft = makeDraft();
    const record = breakdown.draftToTaskRecord(draft, { goal: draft.goal });

    // task.json 저장
    await storage.createTask(record);
    // markdown 저장
    const mdPath = await markdown.writeTaskMarkdown(record.id, record);

    // task.json이 실제로 디스크에 있어야 함
    const taskFile = path.join(dataDir, 'tasks', record.id, 'task.json');
    const rawJson = await fs.readFile(taskFile, 'utf-8');
    const parsed = JSON.parse(rawJson) as TaskRecord;
    expect(parsed.id).toBe(record.id);
    expect(parsed.epics).toHaveLength(2);
    expect(parsed.tasks).toHaveLength(3);

    // markdown 파일 존재
    const mdContent = await fs.readFile(mdPath, 'utf-8');
    expect(mdContent).toContain(`# ${record.title}`);
    expect(mdContent).toContain('## 목표');

    // 인덱스에 요약이 기록됨
    const metas = await storage.listTasks();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe(record.id);
    expect(metas[0].taskCount).toBe(3);
    expect(metas[0].epicCount).toBe(2);
    expect(metas[0].completedTaskCount).toBe(0);
  });

  it('Coordinator pickNextTask → assignTask → integrateWorkerResult 흐름으로 progress가 갱신된다', async () => {
    const record = breakdown.draftToTaskRecord(makeDraft(), { goal: 'g' });
    await storage.createTask(record);

    // 1. pickNextTask: 첫 번째 Task (의존 없음, priority=high)
    const loaded1 = await storage.readTask(record.id);
    const next1 = coordinator.pickNextTask(loaded1!);
    expect(next1).not.toBeNull();
    expect(next1!.title).toBe('스토리지 구현'); // high priority

    // 2. assignTask → in_progress로 전이
    await coordinator.assignTask(record.id, next1!.id, 'coder');
    const loaded2 = await storage.readTask(record.id);
    expect(loaded2!.tasks.find((t) => t.id === next1!.id)!.status).toBe('in_progress');

    // 3. integrateWorkerResult: completed 통합
    const workerResult: WorkerResult = {
      taskId: next1!.id,
      status: 'completed',
      summary: '저장소 구현 완료',
      completedSubtaskIds: next1!.subtasks.map((s) => s.id),
      changedFiles: ['src/lib/tasks/storage.ts'],
    };
    await coordinator.integrateWorkerResult(record.id, next1!.id, workerResult);

    // 4. Task 상태 확인: done, progress 갱신
    const loaded3 = await storage.readTask(record.id);
    const itemDone = loaded3!.tasks.find((t) => t.id === next1!.id)!;
    expect(itemDone.status).toBe('done');
    expect(itemDone.resultSummary).toBe('저장소 구현 완료');
    expect(itemDone.subtasks.every((s) => s.checked)).toBe(true);
    expect(loaded3!.changedFiles).toContain('src/lib/tasks/storage.ts');

    const progress = coordinator.computeProgress(loaded3!);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.percent).toBe(33);

    // 5. 다음 실행 가능한 Task는 Markdown 렌더러 (의존 해소됨)
    const next2 = coordinator.pickNextTask(loaded3!);
    expect(next2).not.toBeNull();
    expect(next2!.title).toBe('Markdown 렌더러');
  });

  it('createCheckpoint → checkpoint 파일 생성 + buildResumeContext로 재개 가능', async () => {
    const record = breakdown.draftToTaskRecord(makeDraft(), { goal: 'g' });
    await storage.createTask(record);

    // 한 Task를 done으로 만들고 다른 Task를 in_progress로 만든다
    const reloaded = await storage.readTask(record.id);
    const firstId = reloaded!.tasks[0].id;
    await coordinator.assignTask(record.id, firstId, 'coder');
    await coordinator.integrateWorkerResult(record.id, firstId, {
      taskId: firstId,
      status: 'completed',
      summary: '완료',
      completedSubtaskIds: [],
      changedFiles: [],
    });

    const secondId = reloaded!.tasks[1].id;
    await coordinator.assignTask(record.id, secondId, 'coder');

    // Checkpoint 생성 (run 없이)
    const cp = await checkpoint.createCheckpoint(record.id, undefined, {
      id: 'cp_int_1',
      now: 9999,
    });
    expect(cp.id).toBe('cp_int_1');
    expect(cp.completedTaskIds).toContain(firstId);
    expect(cp.inProgressTaskIds).toContain(secondId);

    // checkpoint.json 파일이 실제로 존재
    const cpFile = path.join(
      dataDir,
      'tasks',
      record.id,
      'checkpoints',
      'cp_int_1.json'
    );
    const rawCp = await fs.readFile(cpFile, 'utf-8');
    const parsedCp = JSON.parse(rawCp);
    expect(parsedCp.id).toBe('cp_int_1');
    expect(parsedCp.resumePrompt).toContain('Task Resume');

    // checkpoint.md도 있어야 함
    const cpMdFile = path.join(
      dataDir,
      'tasks',
      record.id,
      'checkpoints',
      'cp_int_1.md'
    );
    const rawCpMd = await fs.readFile(cpMdFile, 'utf-8');
    expect(rawCpMd).toContain('# Checkpoint');

    // TaskRecord.latestCheckpointId가 갱신됐어야 함
    const updatedTask = await storage.readTask(record.id);
    expect(updatedTask!.latestCheckpointId).toBe('cp_int_1');

    // buildResumeContext로 재개 가능
    const ctx = await context.buildResumeContext(record.id);
    expect(ctx.checkpointId).toBe('cp_int_1');
    expect(ctx.metadata.hasCheckpoint).toBe(true);
    expect(ctx.metadata.completedTaskCount).toBe(1);
    expect(ctx.metadata.inProgressTaskCount).toBe(1);
    expect(ctx.userMessage).toContain('Task Resume');
    expect(ctx.systemPrompt).toContain(record.title);

    // formatForChat: [system, user] 배열
    const messages = context.formatForChat(ctx);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('동시 updateTask 호출도 파일 락으로 직렬화되어 인덱스/파일이 손상되지 않는다', async () => {
    const record = breakdown.draftToTaskRecord(makeDraft(), { goal: 'g' });
    await storage.createTask(record);

    const firstId = record.tasks[0].id;

    // assignTask 하나 + 상태 변경 updater 두 번을 동시 실행
    await coordinator.assignTask(record.id, firstId, 'coder');

    await Promise.all([
      storage.updateTask(record.id, (t) => ({
        ...t,
        changedFiles: [...t.changedFiles, 'src/a.ts'],
      })),
      storage.updateTask(record.id, (t) => ({
        ...t,
        changedFiles: [...t.changedFiles, 'src/b.ts'],
      })),
      storage.updateTask(record.id, (t) => ({
        ...t,
        openQuestions: [...t.openQuestions, 'Q?'],
      })),
    ]);

    const final = await storage.readTask(record.id);
    expect(final).not.toBeNull();
    // a.ts, b.ts 둘 다 최종 상태에 있어야 함 (순서 무관)
    expect(final!.changedFiles).toEqual(expect.arrayContaining(['src/a.ts', 'src/b.ts']));
    expect(final!.openQuestions).toContain('Q?');

    // 인덱스 파일 JSON 유효
    const indexFile = path.join(dataDir, 'tasks', 'index.json');
    const rawIdx = await fs.readFile(indexFile, 'utf-8');
    expect(() => JSON.parse(rawIdx)).not.toThrow();
  });

  it('deleteTask는 task 디렉토리와 인덱스 항목을 모두 제거한다', async () => {
    const record = breakdown.draftToTaskRecord(makeDraft(), { goal: 'g' });
    await storage.createTask(record);
    await markdown.writeTaskMarkdown(record.id, record);

    const before = await storage.listTasks();
    expect(before.map((m) => m.id)).toContain(record.id);

    await storage.deleteTask(record.id);

    const after = await storage.listTasks();
    expect(after.map((m) => m.id)).not.toContain(record.id);

    // task 디렉토리가 사라졌는지 확인
    const taskDir = path.join(dataDir, 'tasks', record.id);
    await expect(fs.access(taskDir)).rejects.toThrow();
  });

  it('listCheckpoints는 createdAt 내림차순으로 최신 checkpoint를 먼저 반환한다', async () => {
    const record = breakdown.draftToTaskRecord(makeDraft(), { goal: 'g' });
    await storage.createTask(record);

    // 2개 checkpoint 연속 생성 (now를 명시해서 시간 순서 보장)
    await checkpoint.createCheckpoint(record.id, undefined, { id: 'cp_a', now: 1000 });
    await checkpoint.createCheckpoint(record.id, undefined, { id: 'cp_b', now: 2000 });

    const summaries = await checkpoint.listCheckpoints(record.id);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].id).toBe('cp_b'); // 최신 먼저
    expect(summaries[1].id).toBe('cp_a');
  });
});

describe.skipIf(!process.env.OLLAMA_URL)('Task Mode with real LLM breakdown', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    dataDir = setup.dataDir;
    cleanup = setup.cleanup;
    await reloadModules();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('runBreakdown이 유효한 TaskRecord를 반환한다 (실제 Ollama 호출)', async () => {
    const record = await breakdown.runBreakdown(
      { goal: '간단한 TODO 앱 뼈대 작성' },
      {
        ollamaUrl: process.env.OLLAMA_URL!,
        ollamaModel: process.env.OLLAMA_MODEL ?? 'qwen3.5:9b',
        maxIterations: 1,
        systemPrompt: '',
        allowedPaths: [],
        deniedPaths: [],
        toolApprovalMode: 'auto',
      }
    );
    expect(record.id).toMatch(/^task_/);
    expect(record.mode).toBe('task');
    expect(record.epics.length).toBeGreaterThan(0);
    expect(record.tasks.length).toBeGreaterThan(0);
  });
});
