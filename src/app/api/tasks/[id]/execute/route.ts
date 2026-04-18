import { NextRequest } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { formatSSE } from '@/lib/ollama/streaming';
import { logger, getErrorMessage } from '@/lib/logger';
import { initializeTools, registerCustomTools, registerMcpTools } from '@/lib/tools/init';
import { runSubAgentStream } from '@/lib/agent/subagent-runner';
import { readTask } from '@/lib/tasks/storage';
import { writeTaskMarkdown } from '@/lib/tasks/markdown';
import {
  assignTask,
  integrateWorkerResult,
  pickNextTask,
  computeProgress,
  isIdle,
  isCompleted,
  shouldReplan,
} from '@/lib/tasks/coordinator';
import type { AgentConfig, TaskWorkerContext } from '@/lib/agent/types';
import type { TaskItem, TaskWorkerRole, WorkerResult } from '@/types/task';

const SUBAGENT_ROLES: TaskWorkerRole[] = ['coder', 'researcher', 'analyst', 'verifier'];

function resolveWorkerRole(item: TaskItem): TaskWorkerRole {
  if (item.owner && SUBAGENT_ROLES.includes(item.owner)) return item.owner;
  return 'coder';
}

function buildWorkerPrompt(item: TaskItem, goal: string): string {
  const parts: string[] = [];
  parts.push(`# Task 목표 (상위)\n${goal}`);
  parts.push(`# 할당된 Task\n${item.title}`);
  if (item.description) parts.push(`## 설명\n${item.description}`);
  if (item.definitionOfDone.length > 0) {
    parts.push(`## 완료 조건 (DoD)\n${item.definitionOfDone.map((d) => `- ${d}`).join('\n')}`);
  }
  if (item.subtasks.length > 0) {
    parts.push(
      `## 체크리스트 (SubTask)\n${item.subtasks
        .map((s) => `- [${s.checked ? 'x' : ' '}] (${s.id}) ${s.text}`)
        .join('\n')}`,
    );
  }
  parts.push('작업을 수행한 뒤 반드시 <worker-result> JSON 블록으로 결과를 반환하세요.');
  return parts.join('\n\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const encoder = new TextEncoder();
  const { id } = await params;

  try {
    const task = await readTask(id);
    if (!task) {
      return new Response(
        JSON.stringify({ error: 'Task를 찾을 수 없습니다.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const settings = await loadSettings();
    await initializeTools(
      settings.allowedPaths,
      settings.deniedPaths,
      settings.searxngUrl,
      settings.ollamaUrl,
      settings.imageModel,
      settings.webSearchProvider || 'searxng',
      settings.ollamaApiKey || '',
    );
    if (settings.customTools?.length) registerCustomTools(settings.customTools);
    if (settings.mcpServers?.length) await registerMcpTools(settings.mcpServers);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(formatSSE(event, data)));
        };

        try {
          const nextItem = pickNextTask(task);

          if (!nextItem) {
            send('task_idle', {
              idle: isIdle(task),
              completed: isCompleted(task),
              needsReplan: shouldReplan(task),
              progress: computeProgress(task),
            });
            send('done', { status: 'idle' });
            controller.close();
            return;
          }

          const owner = resolveWorkerRole(nextItem);
          send('task_pick', {
            taskId: task.id,
            itemId: nextItem.id,
            title: nextItem.title,
            owner,
          });

          await assignTask(task.id, nextItem.id, owner);

          const parentConfig: AgentConfig = {
            ollamaUrl: settings.ollamaUrl,
            ollamaModel: settings.ollamaModel,
            maxIterations: settings.maxIterations,
            systemPrompt: settings.systemPrompt,
            allowedPaths: settings.allowedPaths,
            deniedPaths: settings.deniedPaths,
            fallbackModels: settings.fallbackModels || [],
            modelOptions: settings.modelOptions
              ? {
                  temperature: settings.modelOptions.temperature,
                  top_p: settings.modelOptions.topP,
                  num_predict: settings.modelOptions.numPredict,
                }
              : undefined,
            nestingDepth: 0,
            maxNestingDepth: 2,
          };

          const taskContext: TaskWorkerContext = {
            taskId: task.id,
            taskItemId: nextItem.id,
            writeScope: nextItem.writeScope,
            allowedTools: nextItem.allowedTools,
            workerRole: owner,
          };

          const workerPrompt = buildWorkerPrompt(nextItem, task.goal);
          const context = `Task 목표: ${task.goal}\n작업 단위: ${nextItem.title} (${nextItem.id})`;

          let workerResult: WorkerResult | undefined;
          let aborted = false;
          try {
            for await (const evt of runSubAgentStream(
              parentConfig,
              owner,
              workerPrompt,
              context,
              taskContext,
            )) {
              if (request.signal.aborted) {
                aborted = true;
                break;
              }
              if (evt.type === 'subagent_done') {
                workerResult = evt.data.workerResult as WorkerResult | undefined;
              }
              send(evt.type, evt.data);
            }
            if (aborted) {
              send('done', { status: 'aborted' });
              controller.close();
              return;
            }
          } catch (err) {
            send('subagent_error', { message: getErrorMessage(err) });
          }

          if (!workerResult) {
            workerResult = {
              taskId: nextItem.id,
              status: 'failed',
              summary: 'Sub-agent에서 WorkerResult를 생성하지 못했습니다.',
              completedSubtaskIds: [],
              changedFiles: [],
              blocker: 'no-worker-result',
            };
          }

          await integrateWorkerResult(task.id, nextItem.id, workerResult);

          const refreshed = await readTask(task.id);
          if (refreshed) {
            await writeTaskMarkdown(task.id, refreshed);
            send('task_update', {
              taskId: task.id,
              itemId: nextItem.id,
              workerResult,
              progress: computeProgress(refreshed),
              needsReplan: shouldReplan(refreshed),
              completed: isCompleted(refreshed),
            });
          } else {
            send('task_update', { taskId: task.id, itemId: nextItem.id, workerResult });
          }

          send('done', { status: 'executed', itemId: nextItem.id });
        } catch (err) {
          logger.error('TASKS', 'execute 실패', err);
          send('error', { message: getErrorMessage(err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    logger.error('TASKS', `POST /api/tasks/${id}/execute 실패`, err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
