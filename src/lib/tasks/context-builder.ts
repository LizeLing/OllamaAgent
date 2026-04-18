import type {
  TaskCheckpoint,
  TaskItem,
  TaskItemStatus,
  TaskRecord,
  TaskRun,
} from '@/types/task';
import {
  listCheckpoints,
  listRuns,
  readCheckpoint,
  readTask,
} from './storage';

export interface ResumeOptions {
  /** 특정 Checkpoint를 강제 선택. 미지정 시 latestCheckpointId 또는 최신 checkpoint 자동 선택. */
  checkpointId?: string;
  /** 최근 TaskRun 요약 포함 여부. 기본 false. */
  includeRecentRun?: boolean;
  /** RAG memory 검색 주입. 기본 off. */
  memorySearch?: (query: string, topK: number) => Promise<string[]>;
  /** Knowledge 검색 주입. 기본 off. */
  knowledgeSearch?: (query: string, topK: number) => Promise<Array<{ text: string; source?: string }>>;
  /** memory/knowledge 각 topK. 기본 3. */
  topK?: number;
}

export interface ResumeChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ResumeContext {
  taskId: string;
  checkpointId?: string;
  systemPrompt: string;
  userMessage: string;
  metadata: {
    title: string;
    goal: string;
    status: TaskRecord['status'];
    completedTaskCount: number;
    inProgressTaskCount: number;
    blockedTaskCount: number;
    totalTaskCount: number;
    hasCheckpoint: boolean;
    memoryHits: number;
    knowledgeHits: number;
    includedRecentRun: boolean;
  };
}

const TASK_STATUS_ORDER: TaskItemStatus[] = [
  'in_progress',
  'blocked',
  'todo',
  'done',
  'dropped',
];

const TASK_STATUS_LABEL: Record<TaskItemStatus, string> = {
  todo: '대기',
  in_progress: '진행 중',
  blocked: '차단됨',
  done: '완료',
  dropped: '취소',
};

function summarizeTasks(tasks: TaskItem[]): string[] {
  const lines: string[] = [];
  for (const status of TASK_STATUS_ORDER) {
    const group = tasks.filter((t) => t.status === status);
    if (group.length === 0) continue;
    lines.push(`### ${TASK_STATUS_LABEL[status]} (${group.length})`);
    for (const t of group) {
      const blocker = t.blocker ? ` — blocker: ${t.blocker}` : '';
      lines.push(`- \`${t.id}\` ${t.title}${blocker}`);
    }
  }
  return lines;
}

function summarizeEpics(task: TaskRecord): string[] {
  if (task.epics.length === 0) return [];
  const lines: string[] = [];
  for (const epic of task.epics) {
    lines.push(`- \`${epic.id}\` ${epic.title} (상태: ${epic.status}, 포함 ${epic.taskIds.length}개)`);
  }
  return lines;
}

function summarizeDecisions(task: TaskRecord, limit = 5): string[] {
  if (task.decisions.length === 0) return [];
  const recent = task.decisions.slice(-limit);
  return recent.map((d) => {
    const rationale = d.rationale ? ` (이유: ${d.rationale})` : '';
    return `- ${d.summary}${rationale}`;
  });
}

function summarizeRun(run: TaskRun): string {
  const duration = run.endedAt ? `${Math.round((run.endedAt - run.startedAt) / 1000)}초` : '진행 중';
  const summary = run.summary ? ` — ${run.summary}` : '';
  return `- \`${run.id}\` (${run.status}, ${duration})${summary}`;
}

async function resolveCheckpoint(
  taskId: string,
  task: TaskRecord,
  options: ResumeOptions,
): Promise<TaskCheckpoint | null> {
  if (options.checkpointId) {
    return await readCheckpoint(taskId, options.checkpointId);
  }
  if (task.latestCheckpointId) {
    const cp = await readCheckpoint(taskId, task.latestCheckpointId);
    if (cp) return cp;
  }
  const summaries = await listCheckpoints(taskId);
  if (summaries.length === 0) return null;
  return await readCheckpoint(taskId, summaries[0].id);
}

/**
 * 다음 세션이 Task State + Checkpoint 기반으로 재개할 수 있도록 컨텍스트를 조립한다.
 * LLM 호출 없이 순수하게 Task + Checkpoint + (선택적) memory/knowledge 검색 결과로 구성.
 * 전체 transcript는 기본 입력이 아니며, 필요 시 메모리/지식 검색으로 보충한다.
 */
export async function buildResumeContext(
  taskId: string,
  options: ResumeOptions = {},
): Promise<ResumeContext> {
  const task = await readTask(taskId);
  if (!task) throw new Error(`Task를 찾을 수 없습니다: ${taskId}`);

  const checkpoint = await resolveCheckpoint(taskId, task, options);
  const topK = options.topK ?? 3;

  // 1. System Prompt — 역할, Task 목표, 수용 조건, 현재 상태
  const systemLines: string[] = [];
  systemLines.push('당신은 이전 세션에서 중단된 Task를 이어받는 에이전트입니다.');
  systemLines.push('아래 Task State + Checkpoint를 기준으로 다음 행동을 결정하세요.');
  systemLines.push('Full transcript는 입력에 포함되지 않으므로, Task State를 정본으로 신뢰하세요.');
  systemLines.push('');
  systemLines.push(`# Task: ${task.title} (\`${task.id}\`)`);
  systemLines.push(`## 목표\n${task.goal || '(미정의)'}`);

  if (task.acceptanceCriteria.length > 0) {
    systemLines.push('## 수용 조건');
    for (const ac of task.acceptanceCriteria) systemLines.push(`- ${ac}`);
  }

  systemLines.push(`## 상태\n- Task 전체: ${task.tasks.length}개`);
  systemLines.push(`- 완료: ${task.tasks.filter((t) => t.status === 'done').length}개`);
  systemLines.push(`- 진행 중: ${task.tasks.filter((t) => t.status === 'in_progress').length}개`);
  systemLines.push(`- 차단됨: ${task.tasks.filter((t) => t.status === 'blocked').length}개`);

  const epicLines = summarizeEpics(task);
  if (epicLines.length > 0) {
    systemLines.push('## Epic');
    systemLines.push(...epicLines);
  }

  const taskLines = summarizeTasks(task.tasks);
  if (taskLines.length > 0) {
    systemLines.push('## Task 목록');
    systemLines.push(...taskLines);
  }

  const decisionLines = summarizeDecisions(task);
  if (decisionLines.length > 0) {
    systemLines.push('## 최근 결정');
    systemLines.push(...decisionLines);
  }

  if (task.changedFiles.length > 0) {
    systemLines.push('## 변경된 파일 (Working Set)');
    for (const f of task.changedFiles) systemLines.push(`- ${f}`);
  }

  if (task.openQuestions.length > 0) {
    systemLines.push('## 미해결 질문');
    for (const q of task.openQuestions) systemLines.push(`- ${q}`);
  }

  // 2. 최근 Run (선택)
  let includedRecentRun = false;
  if (options.includeRecentRun) {
    const runs = await listRuns(taskId);
    if (runs.length > 0) {
      systemLines.push('## 최근 Run (최대 3개)');
      for (const run of runs.slice(0, 3)) systemLines.push(summarizeRun(run));
      includedRecentRun = true;
    }
  }

  // 3. Memory 검색 (선택)
  let memoryHits = 0;
  if (options.memorySearch) {
    try {
      const query = [task.title, task.goal].filter(Boolean).join(' ');
      const memories = await options.memorySearch(query, topK);
      if (memories.length > 0) {
        systemLines.push('## 관련 기억 (보조)');
        for (const m of memories) systemLines.push(`- ${m}`);
        memoryHits = memories.length;
      }
    } catch {
      // 실패해도 계속 진행
    }
  }

  // 4. Knowledge 검색 (선택)
  let knowledgeHits = 0;
  if (options.knowledgeSearch) {
    try {
      const query = [task.title, task.goal].filter(Boolean).join(' ');
      const docs = await options.knowledgeSearch(query, topK);
      if (docs.length > 0) {
        systemLines.push('## 관련 지식 문서 (보조)');
        for (const d of docs) {
          const tag = d.source ? ` [${d.source}]` : '';
          systemLines.push(`- ${d.text}${tag}`);
        }
        knowledgeHits = docs.length;
      }
    } catch {
      // 실패해도 계속 진행
    }
  }

  // 5. User Message — checkpoint의 resumePrompt를 그대로 재사용
  const userMessage = checkpoint
    ? checkpoint.resumePrompt
    : buildFallbackResumePrompt(task);

  return {
    taskId,
    ...(checkpoint?.id !== undefined && { checkpointId: checkpoint.id }),
    systemPrompt: systemLines.join('\n'),
    userMessage,
    metadata: {
      title: task.title,
      goal: task.goal,
      status: task.status,
      completedTaskCount: task.tasks.filter((t) => t.status === 'done').length,
      inProgressTaskCount: task.tasks.filter((t) => t.status === 'in_progress').length,
      blockedTaskCount: task.tasks.filter((t) => t.status === 'blocked').length,
      totalTaskCount: task.tasks.length,
      hasCheckpoint: Boolean(checkpoint),
      memoryHits,
      knowledgeHits,
      includedRecentRun,
    },
  };
}

function buildFallbackResumePrompt(task: TaskRecord): string {
  const lines: string[] = [];
  lines.push(`# Task Resume: ${task.title}`);
  lines.push('');
  lines.push(`## 목표`);
  lines.push(task.goal || '(미정의)');
  lines.push('');
  lines.push('## 다음 행동');
  const ready = task.tasks.filter((t) => t.status === 'in_progress' || t.status === 'todo');
  if (ready.length === 0) {
    lines.push('- 이어서 수행할 Task가 없습니다. Task 상태를 확인하세요.');
  } else {
    for (const t of ready.slice(0, 5)) {
      lines.push(`- \`${t.id}\` ${t.title}`);
    }
  }
  return lines.join('\n');
}

/**
 * ResumeContext를 /api/chat 등에서 바로 쓸 수 있는 메시지 배열로 변환한다.
 */
export function formatForChat(ctx: ResumeContext): ResumeChatMessage[] {
  return [
    { role: 'system', content: ctx.systemPrompt },
    { role: 'user', content: ctx.userMessage },
  ];
}
