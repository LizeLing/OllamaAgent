import fs from 'fs/promises';
import path from 'path';
import { withFileLock } from '@/lib/storage/file-lock';
import {
  getTaskMarkdownPath,
  getCheckpointMarkdownPath,
  ensureTaskDirectories,
} from './storage';
import type {
  TaskRecord,
  TaskCheckpoint,
  TaskItem,
  TaskItemStatus,
} from '@/types/task';

const TASK_STATUS_LABELS: Record<TaskItemStatus, string> = {
  todo: '대기',
  in_progress: '진행 중',
  blocked: '차단됨',
  done: '완료',
  dropped: '취소',
};

const TASK_STATUS_ORDER: TaskItemStatus[] = [
  'in_progress',
  'todo',
  'blocked',
  'done',
  'dropped',
];

function toIsoString(ms: number): string {
  return new Date(ms).toISOString();
}

function escapeYamlString(value: string): string {
  if (value === '') return '""';
  const needsQuote =
    /[:#&*?{}\[\],!|>%@`"\n]/.test(value) ||
    /^\s|\s$/.test(value) ||
    /^[-?]\s/.test(value) ||
    /^[\s"']/.test(value);
  if (needsQuote) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function renderFrontmatter(fields: Record<string, string | undefined>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${escapeYamlString(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function renderBulletList(items: string[]): string {
  if (items.length === 0) return '_없음_';
  return items.map((item) => `- ${item}`).join('\n');
}

function renderChecklistItem(item: TaskItem): string {
  const header = `### ${item.title} \`${item.id}\``;
  const meta = `- 상태: ${TASK_STATUS_LABELS[item.status]}`
    + ` / 우선순위: ${item.priority}`
    + ` / 크기: ${item.size}`
    + (item.owner ? ` / Owner: ${item.owner}` : '');
  const description = item.description ? `\n${item.description}` : '';
  const depends =
    item.dependsOn.length > 0
      ? `\n- 의존: ${item.dependsOn.map((id) => `\`${id}\``).join(', ')}`
      : '';
  const dod =
    item.definitionOfDone.length > 0
      ? `\n\n**완료 조건**\n${renderBulletList(item.definitionOfDone)}`
      : '';
  const subtasks =
    item.subtasks.length > 0
      ? `\n\n**SubTask**\n${item.subtasks
          .map((s) => `- [${s.checked ? 'x' : ' '}] ${s.text}`)
          .join('\n')}`
      : '';
  const writeScope =
    item.writeScope && item.writeScope.length > 0
      ? `\n- 쓰기 범위: ${item.writeScope.map((p) => `\`${p}\``).join(', ')}`
      : '';
  const tools =
    item.allowedTools && item.allowedTools.length > 0
      ? `\n- 허용 도구: ${item.allowedTools.map((t) => `\`${t}\``).join(', ')}`
      : '';
  const blocker = item.blocker ? `\n- Blocker: ${item.blocker}` : '';
  const result = item.resultSummary ? `\n- 결과: ${item.resultSummary}` : '';

  return `${header}\n${meta}${depends}${writeScope}${tools}${blocker}${result}${description}${dod}${subtasks}`;
}

function groupTasksByStatus(tasks: TaskItem[]): Map<TaskItemStatus, TaskItem[]> {
  const groups = new Map<TaskItemStatus, TaskItem[]>();
  for (const status of TASK_STATUS_ORDER) {
    groups.set(status, []);
  }
  for (const task of tasks) {
    groups.get(task.status)?.push(task);
  }
  return groups;
}

export function renderTaskMarkdown(task: TaskRecord): string {
  const frontmatter = renderFrontmatter({
    taskId: task.id,
    title: task.title,
    status: task.status,
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
    latestCheckpointId: task.latestCheckpointId,
    activeRunId: task.activeRunId,
  });

  const sections: string[] = [frontmatter];

  sections.push(`# ${task.title}`);
  sections.push(`## 목표\n${task.goal || '_미정의_'}`);

  if (task.canonicalPlan) {
    sections.push(`## 정본 계획\n${task.canonicalPlan}`);
  }

  sections.push(
    `## 수용 조건\n${renderBulletList(task.acceptanceCriteria)}`
  );

  if (task.epics.length > 0) {
    const epicLines = task.epics.map((epic) => {
      const header = `### ${epic.title} \`${epic.id}\``;
      const meta = `- 상태: ${epic.status}`;
      const desc = epic.description ? `\n${epic.description}` : '';
      const children =
        epic.taskIds.length > 0
          ? `\n- 포함 Task: ${epic.taskIds.map((id) => `\`${id}\``).join(', ')}`
          : '';
      return `${header}\n${meta}${children}${desc}`;
    });
    sections.push(`## Epic\n${epicLines.join('\n\n')}`);
  } else {
    sections.push(`## Epic\n_없음_`);
  }

  const groups = groupTasksByStatus(task.tasks);
  const taskSectionLines: string[] = [];
  for (const status of TASK_STATUS_ORDER) {
    const items = groups.get(status) ?? [];
    if (items.length === 0) continue;
    taskSectionLines.push(`### ${TASK_STATUS_LABELS[status]} (${items.length})`);
    taskSectionLines.push(items.map(renderChecklistItem).join('\n\n'));
  }
  sections.push(
    `## Task\n${taskSectionLines.length > 0 ? taskSectionLines.join('\n\n') : '_없음_'}`
  );

  if (task.decisions.length > 0) {
    const decisionLines = task.decisions.map((d) => {
      const time = toIsoString(d.createdAt);
      const rationale = d.rationale ? ` — ${d.rationale}` : '';
      return `- (${time}) ${d.summary}${rationale}`;
    });
    sections.push(`## 결정 사항\n${decisionLines.join('\n')}`);
  } else {
    sections.push(`## 결정 사항\n_없음_`);
  }

  sections.push(
    `## 변경된 파일\n${renderBulletList(task.changedFiles.map((p) => `\`${p}\``))}`
  );

  sections.push(
    `## 미해결 질문\n${renderBulletList(task.openQuestions)}`
  );

  return sections.join('\n\n') + '\n';
}

export function renderCheckpointMarkdown(cp: TaskCheckpoint): string {
  const frontmatter = renderFrontmatter({
    taskId: cp.taskId,
    checkpointId: cp.id,
    runId: cp.runId,
    status: 'active',
    createdAt: toIsoString(cp.createdAt),
  });

  const sections: string[] = [frontmatter];

  sections.push(`# Checkpoint: ${cp.summary}`);

  sections.push(`## 목표\n${cp.summary || '_미정의_'}`);

  sections.push(
    `## 현재 상태\n- 완료: ${cp.completedTaskIds.length}개`
      + `\n- 진행 중: ${cp.inProgressTaskIds.length}개`
      + `\n- 차단됨: ${cp.blockedTaskIds.length}개`
  );

  sections.push(
    `## 완료된 Task\n${renderBulletList(cp.completedTaskIds.map((id) => `\`${id}\``))}`
  );

  sections.push(
    `## 진행 중 / 차단됨\n`
      + `**진행 중**\n${renderBulletList(cp.inProgressTaskIds.map((id) => `\`${id}\``))}`
      + `\n\n**차단됨**\n${renderBulletList(cp.blockedTaskIds.map((id) => `\`${id}\``))}`
  );

  sections.push(`## 결정 사항\n${renderBulletList(cp.decisions)}`);

  sections.push(
    `## 변경된 파일\n${renderBulletList(cp.changedFiles.map((p) => `\`${p}\``))}`
  );

  sections.push(`## 미해결 질문\n${renderBulletList(cp.openQuestions)}`);

  sections.push(`## 다음 행동\n${renderBulletList(cp.nextActions)}`);

  sections.push(`## Resume Prompt\n\n\`\`\`\n${cp.resumePrompt}\n\`\`\``);

  return sections.join('\n\n') + '\n';
}

export async function writeTaskMarkdown(
  taskId: string,
  task: TaskRecord
): Promise<string> {
  const filePath = getTaskMarkdownPath(taskId);
  const content = renderTaskMarkdown(task);

  return withFileLock(filePath, async () => {
    await ensureTaskDirectories(taskId);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
    return filePath;
  });
}

export async function writeCheckpointMarkdown(
  taskId: string,
  cp: TaskCheckpoint
): Promise<string> {
  const filePath = getCheckpointMarkdownPath(taskId, cp.id);
  const content = renderCheckpointMarkdown(cp);

  return withFileLock(filePath, async () => {
    await ensureTaskDirectories(taskId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
    return filePath;
  });
}
