import { v4 as uuidv4 } from 'uuid';
import { chat } from '@/lib/ollama/client';
import type { AgentConfig } from '@/lib/agent/types';
import type {
  TaskRecord,
  TaskEpic,
  TaskItem,
  TaskItemPriority,
  TaskItemSize,
  TaskSource,
  ChecklistItem,
  TaskWorkerRole,
} from '@/types/task';

// ---------- 입력 / 중간 결과 타입 ----------

export interface BreakdownInput {
  goal: string;
  title?: string;
  source?: TaskSource;
  contextFiles?: Array<{ path: string; content: string }>;
  constraints?: string[];
}

export interface ParsedEpicDraft {
  title: string;
  description: string;
}

export interface ParsedTaskDraft {
  epicIndex: number;
  title: string;
  description: string;
  priority?: TaskItemPriority;
  size?: TaskItemSize;
  owner?: TaskWorkerRole;
  dependsOn?: number[]; // 같은 배열 내 인덱스 (나중에 id로 변환)
  definitionOfDone?: string[];
  subtasks?: string[];
  writeScope?: string[];
  allowedTools?: string[];
}

export interface BreakdownDraft {
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  epics: ParsedEpicDraft[];
  tasks: ParsedTaskDraft[];
}

export class BreakdownParseError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = 'BreakdownParseError';
  }
}

// ---------- 프롬프트 ----------

const SYSTEM_PROMPT = `당신은 소프트웨어 작업 분해 전문가입니다.
사용자가 제시한 목표를 **Epic(1-3개) / Task(실행 단위) / SubTask(체크리스트)** 3계층으로 분해합니다.

규칙:
- Epic은 관리 단위로 1-3개만 생성합니다.
- 각 Task는 하나의 Sub-agent가 수행할 수 있는 실질적 실행 단위여야 합니다.
- SubTask는 별도 agent가 아니라 Worker 내부 체크리스트로만 유지합니다.
- Task 간 의존성은 같은 응답 안의 다른 Task 인덱스(0부터 시작)를 \`dependsOn\` 배열에 나열합니다.
- owner 필드에는 \`coder\`, \`researcher\`, \`analyst\`, \`verifier\` 중 가장 적합한 값을 선택합니다.
- priority는 \`high | medium | low\`, size는 \`S | M | L\` 중 하나를 반드시 사용합니다.

응답은 반드시 아래 JSON 스키마를 따르는 **JSON만** 출력하세요. 코드펜스나 설명 문장은 넣지 마세요.

{
  "title": "작업 이름",
  "goal": "목표 설명",
  "acceptanceCriteria": ["완료 조건 1", "완료 조건 2"],
  "epics": [
    { "title": "Epic 제목", "description": "Epic 설명" }
  ],
  "tasks": [
    {
      "epicIndex": 0,
      "title": "Task 제목",
      "description": "Task 설명",
      "priority": "high",
      "size": "M",
      "owner": "coder",
      "dependsOn": [],
      "definitionOfDone": ["DoD 1"],
      "subtasks": ["체크리스트 1", "체크리스트 2"],
      "writeScope": ["src/app/..."],
      "allowedTools": ["filesystem_read", "filesystem_write"]
    }
  ]
}`;

export function buildBreakdownPrompt(input: BreakdownInput): {
  system: string;
  user: string;
} {
  const parts: string[] = [];
  parts.push(`# 목표\n${input.goal}`);
  if (input.title) parts.push(`# 작업 이름\n${input.title}`);
  if (input.source) {
    parts.push(`# 출처\n- type: ${input.source.type}${input.source.ref ? `\n- ref: ${input.source.ref}` : ''}`);
  }
  if (input.constraints && input.constraints.length > 0) {
    parts.push(`# 제약 조건\n${input.constraints.map((c) => `- ${c}`).join('\n')}`);
  }
  if (input.contextFiles && input.contextFiles.length > 0) {
    const MAX_CHARS = 3000;
    const rendered = input.contextFiles.map((f) => {
      const snippet = f.content.length > MAX_CHARS
        ? f.content.slice(0, MAX_CHARS) + '\n... (이하 생략)'
        : f.content;
      return `## ${f.path}\n\`\`\`\n${snippet}\n\`\`\``;
    }).join('\n\n');
    parts.push(`# 참조 파일\n${rendered}`);
  }
  parts.push('위 정보를 바탕으로 분해 결과를 JSON으로만 출력하세요.');
  return {
    system: SYSTEM_PROMPT,
    user: parts.join('\n\n'),
  };
}

// ---------- 파서 ----------

/** 응답에서 JSON 본문만 추출한다. 코드펜스와 선행/후행 텍스트를 모두 제거한다. */
function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();
  // 코드펜스 제거
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // 첫 { 부터 마지막 } 까지
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BreakdownParseError(`필드 '${field}'는 문자열이어야 합니다.`);
  }
  return value.trim();
}

function toStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BreakdownParseError(`필드 '${field}'는 배열이어야 합니다.`);
  }
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
    .filter((v) => v.length > 0);
}

const PRIORITY_SET: TaskItemPriority[] = ['high', 'medium', 'low'];
const SIZE_SET: TaskItemSize[] = ['S', 'M', 'L'];
const OWNER_SET: TaskWorkerRole[] = ['main', 'coder', 'researcher', 'analyst', 'verifier'];

function normalizePriority(value: unknown): TaskItemPriority {
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if ((PRIORITY_SET as string[]).includes(lower)) return lower as TaskItemPriority;
  }
  return 'medium';
}

function normalizeSize(value: unknown): TaskItemSize {
  if (typeof value === 'string') {
    const upper = value.toUpperCase().trim();
    if ((SIZE_SET as string[]).includes(upper)) return upper as TaskItemSize;
  }
  return 'M';
}

function normalizeOwner(value: unknown): TaskWorkerRole | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.toLowerCase().trim();
  return (OWNER_SET as string[]).includes(lower) ? (lower as TaskWorkerRole) : undefined;
}

function toNumberArray(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v >= 0);
}

export function parseBreakdownResponse(raw: string): BreakdownDraft {
  const body = extractJsonBody(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new BreakdownParseError(
      `JSON 파싱 실패: ${err instanceof Error ? err.message : 'unknown'}`,
      raw,
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BreakdownParseError('응답이 객체가 아닙니다.', raw);
  }
  const obj = parsed as Record<string, unknown>;

  const title = assertString(obj.title, 'title');
  const goal = assertString(obj.goal, 'goal');
  const acceptanceCriteria = toStringArray(obj.acceptanceCriteria, 'acceptanceCriteria');

  const epicsRaw = obj.epics;
  if (!Array.isArray(epicsRaw) || epicsRaw.length === 0) {
    throw new BreakdownParseError('epics 배열이 비어있거나 배열이 아닙니다.', raw);
  }
  const epics: ParsedEpicDraft[] = epicsRaw.map((e, i) => {
    if (!e || typeof e !== 'object') {
      throw new BreakdownParseError(`epics[${i}]가 객체가 아닙니다.`, raw);
    }
    const ep = e as Record<string, unknown>;
    return {
      title: assertString(ep.title, `epics[${i}].title`),
      description: typeof ep.description === 'string' ? ep.description.trim() : '',
    };
  });
  if (epics.length > 3) {
    // 설계 규칙: Epic은 1-3개
    epics.splice(3);
  }

  const tasksRaw = obj.tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    throw new BreakdownParseError('tasks 배열이 비어있거나 배열이 아닙니다.', raw);
  }
  const tasks: ParsedTaskDraft[] = tasksRaw.map((t, i) => {
    if (!t || typeof t !== 'object') {
      throw new BreakdownParseError(`tasks[${i}]가 객체가 아닙니다.`, raw);
    }
    const tk = t as Record<string, unknown>;
    const epicIndexRaw = tk.epicIndex;
    let epicIndex = typeof epicIndexRaw === 'number' ? epicIndexRaw : Number(epicIndexRaw);
    if (!Number.isFinite(epicIndex) || epicIndex < 0 || epicIndex >= epics.length) {
      epicIndex = 0;
    }
    return {
      epicIndex,
      title: assertString(tk.title, `tasks[${i}].title`),
      description: typeof tk.description === 'string' ? tk.description.trim() : '',
      priority: normalizePriority(tk.priority),
      size: normalizeSize(tk.size),
      owner: normalizeOwner(tk.owner),
      dependsOn: toNumberArray(tk.dependsOn),
      definitionOfDone: toStringArray(tk.definitionOfDone, `tasks[${i}].definitionOfDone`),
      subtasks: toStringArray(tk.subtasks, `tasks[${i}].subtasks`),
      writeScope: toStringArray(tk.writeScope, `tasks[${i}].writeScope`),
      allowedTools: toStringArray(tk.allowedTools, `tasks[${i}].allowedTools`),
    };
  });

  return { title, goal, acceptanceCriteria, epics, tasks };
}

// ---------- 변환: Draft → TaskRecord ----------

export function draftToTaskRecord(
  draft: BreakdownDraft,
  input: BreakdownInput,
  options?: { id?: string; now?: number },
): TaskRecord {
  const now = options?.now ?? Date.now();
  const id = options?.id ?? `task_${uuidv4()}`;

  // Epic id 부여
  const epics: TaskEpic[] = draft.epics.map((e) => ({
    id: `epic_${uuidv4()}`,
    title: e.title,
    description: e.description,
    status: 'todo',
    taskIds: [],
  }));

  // Task id 부여 + epicId 연결
  const taskIdByIndex: string[] = draft.tasks.map(() => `ti_${uuidv4()}`);
  const items: TaskItem[] = draft.tasks.map((t, i) => {
    const epic = epics[t.epicIndex] ?? epics[0];
    const itemId = taskIdByIndex[i];
    epic.taskIds.push(itemId);

    const subtasks: ChecklistItem[] = (t.subtasks ?? []).map((text) => ({
      id: `st_${uuidv4()}`,
      text,
      checked: false,
    }));

    // 자기 참조 방지 + 범위 벗어난 인덱스 제거
    const dependsOn = (t.dependsOn ?? [])
      .filter((idx) => idx !== i && idx >= 0 && idx < taskIdByIndex.length)
      .map((idx) => taskIdByIndex[idx]);

    return {
      id: itemId,
      epicId: epic.id,
      title: t.title,
      description: t.description,
      status: 'todo',
      priority: t.priority ?? 'medium',
      size: t.size ?? 'M',
      dependsOn,
      definitionOfDone: t.definitionOfDone ?? [],
      subtasks,
      writeScope: t.writeScope && t.writeScope.length > 0 ? t.writeScope : undefined,
      allowedTools: t.allowedTools && t.allowedTools.length > 0 ? t.allowedTools : undefined,
      owner: t.owner,
    };
  });

  return {
    id,
    title: input.title ?? draft.title,
    goal: draft.goal || input.goal,
    mode: 'task',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    source: input.source,
    acceptanceCriteria: draft.acceptanceCriteria,
    epics,
    tasks: items,
    decisions: [],
    changedFiles: [],
    openQuestions: [],
  };
}

// ---------- LLM 호출 ----------

export interface RunBreakdownOptions {
  /** 파싱 실패 시 재시도 횟수 (기본 1) */
  retries?: number;
  /** TaskRecord id 지정 (테스트용) */
  id?: string;
}

/**
 * 사용자 입력을 Ollama에 분해 요청하여 TaskRecord 초안을 생성한다.
 * 저장은 호출자가 별도로 수행한다.
 */
export async function runBreakdown(
  input: BreakdownInput,
  config: AgentConfig,
  options: RunBreakdownOptions = {},
): Promise<TaskRecord> {
  const { retries = 1 } = options;
  const { system, user } = buildBreakdownPrompt(input);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await chat(config.ollamaUrl, {
      model: config.ollamaModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      think: false,
      format: 'json',
      options: config.modelOptions,
    });
    const raw = response.message?.content ?? '';
    try {
      const draft = parseBreakdownResponse(raw);
      return draftToTaskRecord(draft, input, { id: options.id });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= retries) break;
    }
  }
  throw lastError ?? new BreakdownParseError('Breakdown 실패');
}
