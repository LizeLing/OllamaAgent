'use client';

import { useState, useCallback, useRef } from 'react';
import { Message, ToolCallInfo, ImageInfo, TokenUsage } from '@/types/message';
import { v4 as uuidv4 } from 'uuid';
import { addToast } from '@/hooks/useToast';

interface PendingApproval {
  toolName: string;
  toolInput: Record<string, unknown>;
  confirmId: string;
}

export interface PendingPlan {
  plan: string;
  blockedTools: string[];
  userMessage: string;
  images?: string[];
  model?: string;
  format?: 'json' | Record<string, unknown>;
}

interface SendOptions {
  planMode?: boolean;
  approvedPlan?: string;
}

export type ChatMode = 'chat' | 'task';

export interface TaskCommandResult {
  ok: boolean;
  message: string;
  taskId?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskMode, setTaskMode] = useState<ChatMode>('chat');
  const abortRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setConversationId(id);
      }
    } catch (err) {
      console.error('[loadConversation]', err);
    }
  }, []);

  const saveToServer = useCallback(async (convId: string, msgs: Message[]) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      });
    } catch (err) {
      console.error('[saveToServer]', err);
    }
  }, []);

  const handleSSEEvent = useCallback(
    (assistantId: string, event: string, data: Record<string, unknown>) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;

          switch (event) {
            case 'token':
              return { ...m, content: m.content + (data.content as string) };

            case 'thinking_token': {
              if (data.done) {
                return { ...m, thinkingDuration: data.duration as number };
              }
              return {
                ...m,
                thinkingContent: (m.thinkingContent || '') + (data.content as string),
              };
            }

            case 'tool_start': {
              const tc: ToolCallInfo = {
                id: uuidv4(),
                tool: data.tool as string,
                input: data.input as Record<string, unknown>,
                startTime: Date.now(),
                contentIndex: m.content.length,
              };
              return { ...m, toolCalls: [...(m.toolCalls || []), tc] };
            }

            case 'tool_end': {
              const toolCalls = (m.toolCalls || []).map((tc) =>
                tc.tool === data.tool && tc.endTime === undefined
                  ? {
                      ...tc,
                      output: data.output as string,
                      success: data.success as boolean,
                      endTime: Date.now(),
                    }
                  : tc
              );
              return { ...m, toolCalls };
            }

            case 'image': {
              const img: ImageInfo = {
                base64: data.base64 as string,
                prompt: data.prompt as string,
              };
              return { ...m, images: [...(m.images || []), img] };
            }

            case 'tool_confirm':
              setPendingApproval({
                toolName: data.tool as string,
                toolInput: data.input as Record<string, unknown>,
                confirmId: data.confirmId as string,
              });
              return m;

            case 'loop_detected':
              addToast('warning', data.message as string);
              return m;

            case 'model_fallback':
              addToast('info', `모델이 ${data.originalModel}에서 ${data.usedModel}으로 전환되었습니다.`);
              return m;

            case 'skill_start':
              return {
                ...m,
                skillProgress: {
                  current: 0,
                  total: data.totalSteps as number,
                  skillName: data.skillName as string,
                },
              };

            case 'skill_step':
              return {
                ...m,
                skillProgress: {
                  current: data.step as number,
                  total: data.total as number,
                  skillName: m.skillProgress?.skillName || '',
                },
              };

            case 'skill_end':
              return m;

            case 'subagent_start':
              addToast('info', `서브에이전트(${data.agentType}) 작업 시작`);
              return m;

            case 'subagent_event':
              return m;

            case 'subagent_end':
              addToast('info', `서브에이전트(${data.agentType}) 작업 완료`);
              return m;

            case 'knowledge_search':
              return {
                ...m,
                knowledgeSources: data.sources as import('@/types/knowledge').SearchResultWithSource[],
              };

            case 'plan':
              return { ...m, content: (data.plan as string) ?? m.content };

            case 'plan_blocked':
              return m;

            case 'done': {
              const updates: Partial<Message> = {};
              if (data.tokenUsage) {
                updates.tokenUsage = data.tokenUsage as unknown as TokenUsage;
              }
              if (data.model) {
                updates.model = data.model as string;
              }
              return Object.keys(updates).length > 0 ? { ...m, ...updates } : m;
            }

            case 'error':
              return {
                ...m,
                error: data.message as string,
              };

            default:
              return m;
          }
        })
      );
    },
    []
  );

  const sendMessage = useCallback(async (content: string, images?: string[], model?: string, format?: 'json' | Record<string, unknown>, opts?: SendOptions) => {
    setError(null);

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachedImages: images,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const assistantId = uuidv4();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      images: [],
    };
    setMessages((prev) => [...prev, assistantMessage]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let capturedPlan: string | null = null;
    const capturedBlockedTools: string[] = [];

    try {
      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history,
          images,
          model,
          format,
          planMode: opts?.planMode ?? false,
          approvedPlan: opts?.approvedPlan,
          ...(taskId ? { taskId } : {}),
          ...(taskMode === 'task' ? { taskMode } : {}),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          addToast('warning', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
          throw new Error('Rate limited');
        }
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (eventType === 'plan' && typeof data?.plan === 'string') {
                capturedPlan = data.plan as string;
                if (Array.isArray(data.blockedTools)) {
                  capturedBlockedTools.push(...(data.blockedTools as string[]));
                }
              } else if (eventType === 'plan_blocked' && typeof data?.tool === 'string') {
                capturedBlockedTools.push(data.tool as string);
              }
              handleSSEEvent(assistantId, eventType, data);
              eventType = '';
            } catch {
              // Partial SSE data, skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Mark message as aborted
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, aborted: true } : m
          )
        );
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      addToast('error', msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, error: msg }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      if (capturedPlan) {
        setPendingPlan({
          plan: capturedPlan,
          blockedTools: Array.from(new Set(capturedBlockedTools)),
          userMessage: content,
          images,
          model,
          format,
        });
      }
    }
  }, [messages, handleSSEEvent, taskId, taskMode]);

  const editMessage = useCallback((messageId: string, newContent: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    // Slice before the edited message; sendMessage will add the new user message
    const sliced = messages.slice(0, idx);
    setMessages(sliced);
    sendMessage(newContent);
  }, [messages, sendMessage]);

  const regenerate = useCallback(() => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUserMsg = messages[lastUserIdx];
    // Slice before the last user message; sendMessage will re-add it
    const sliced = messages.slice(0, lastUserIdx);
    setMessages(sliced);
    sendMessage(lastUserMsg.content, lastUserMsg.attachedImages);
  }, [messages, sendMessage]);

  const rewindTo = useCallback(async (messageId: string): Promise<boolean> => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;

    if (!conversationId) {
      setMessages((prev) => prev.slice(0, idx + 1));
      return true;
    }

    try {
      const res = await fetch(`/api/conversations/${conversationId}/rewind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIndex: idx }),
      });
      if (!res.ok) {
        addToast('error', '대화 되돌리기에 실패했습니다.');
        return false;
      }
      const data = await res.json();
      const newMessages = data?.conversation?.messages;
      if (Array.isArray(newMessages)) {
        setMessages(newMessages);
      } else {
        setMessages((prev) => prev.slice(0, idx + 1));
      }
      addToast('info', '대화를 되돌렸습니다.');
      return true;
    } catch (err) {
      console.error('[rewindTo]', err);
      addToast('error', '대화 되돌리기에 실패했습니다.');
      return false;
    }
  }, [messages, conversationId]);

  const forkAt = useCallback(async (messageId: string): Promise<string | null> => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return null;

    if (!conversationId) {
      addToast('warning', '저장되지 않은 대화는 분기할 수 없습니다.');
      return null;
    }

    try {
      const res = await fetch(`/api/conversations/${conversationId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIndex: idx }),
      });
      if (!res.ok) {
        addToast('error', '대화 분기에 실패했습니다.');
        return null;
      }
      const data = await res.json();
      const newId = data?.id;
      if (typeof newId !== 'string') return null;
      addToast('info', '새 대화로 분기되었습니다.');
      return newId;
    } catch (err) {
      console.error('[forkAt]', err);
      addToast('error', '대화 분기에 실패했습니다.');
      return null;
    }
  }, [messages, conversationId]);

  const approvePlan = useCallback(async () => {
    if (!pendingPlan) return;
    const { plan, userMessage, images, model, format } = pendingPlan;
    setPendingPlan(null);
    await sendMessage(userMessage, images, model, format, {
      planMode: false,
      approvedPlan: plan,
    });
  }, [pendingPlan, sendMessage]);

  const requestPlanRevision = useCallback(async (feedback: string) => {
    if (!pendingPlan) return;
    const { userMessage, images, model, format } = pendingPlan;
    setPendingPlan(null);
    const revised = `${userMessage}\n\n[이전 계획에 대한 수정 요청]\n${feedback}`;
    await sendMessage(revised, images, model, format, { planMode: true });
  }, [pendingPlan, sendMessage]);

  const cancelPlan = useCallback(() => {
    setPendingPlan(null);
  }, []);

  const respondToApproval = useCallback(async (confirmId: string, approved: boolean) => {
    try {
      await fetch('/api/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmId, approved }),
      });
    } catch (err) {
      console.error('[respondToApproval]', err);
      addToast('error', '승인 응답에 실패했습니다.');
    }
    setPendingApproval(null);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setTaskId(null);
    setTaskMode('chat');
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: uuidv4(),
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * /task 명령어 처리. sub-command를 파싱해 Task Mode API와 연결한다.
   * - new <goal>: POST /api/tasks → taskId 저장 + taskMode='task'
   * - open <id>: 기존 Task 로드 → taskId 저장 + taskMode='task'
   * - checkpoint: 현재 taskId로 checkpoint 생성
   * - replan: (Main Agent 재계획 — 현재는 플레이스홀더)
   * - done: 현재 taskId 상태를 done으로 전환 후 Chat Mode 복귀
   */
  const handleTaskCommand = useCallback(
    async (rawArgs: string[]): Promise<TaskCommandResult> => {
      const joined = (rawArgs[0] || '').trim();
      if (!joined) {
        return {
          ok: false,
          message:
            '사용법: /task new <목표> | /task open <id> | /task checkpoint | /task replan | /task done',
        };
      }
      const spaceIdx = joined.indexOf(' ');
      const sub = spaceIdx === -1 ? joined : joined.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? '' : joined.slice(spaceIdx + 1).trim();

      try {
        switch (sub) {
          case 'new': {
            if (!rest) {
              return { ok: false, message: '사용법: /task new <목표>' };
            }
            const res = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ goal: rest }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              return { ok: false, message: `Task 생성 실패: ${err?.error || res.status}` };
            }
            const record = await res.json();
            setTaskId(record.id);
            setTaskMode('task');
            return {
              ok: true,
              taskId: record.id,
              message: `Task "${record.title || record.id}"가 생성되었습니다. Task Mode로 전환합니다.`,
            };
          }
          case 'open': {
            if (!rest) {
              return { ok: false, message: '사용법: /task open <id>' };
            }
            const res = await fetch(`/api/tasks/${encodeURIComponent(rest)}`);
            if (!res.ok) {
              return { ok: false, message: `Task를 찾을 수 없습니다: ${rest}` };
            }
            const record = await res.json();
            setTaskId(record.id);
            setTaskMode('task');
            return {
              ok: true,
              taskId: record.id,
              message: `Task "${record.title || record.id}"를 불러왔습니다. Task Mode로 전환합니다.`,
            };
          }
          case 'checkpoint': {
            if (!taskId) {
              return { ok: false, message: '활성 Task가 없습니다. /task open <id> 또는 /task new <목표>로 시작하세요.' };
            }
            const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/checkpoint`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              return { ok: false, message: `checkpoint 생성 실패: ${err?.error || res.status}` };
            }
            const cp = await res.json();
            return { ok: true, taskId, message: `checkpoint ${cp.id}가 생성되었습니다.` };
          }
          case 'replan': {
            if (!taskId) {
              return { ok: false, message: '활성 Task가 없습니다.' };
            }
            return {
              ok: true,
              taskId,
              message: 'replan은 현재 채팅 경로로 진행합니다. 변경이 필요한 내용을 메시지로 입력해주세요.',
            };
          }
          case 'done': {
            if (!taskId) {
              return { ok: false, message: '활성 Task가 없습니다.' };
            }
            const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'done' }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              return { ok: false, message: `Task 종료 실패: ${err?.error || res.status}` };
            }
            const closedId = taskId;
            setTaskId(null);
            setTaskMode('chat');
            return { ok: true, taskId: closedId, message: `Task ${closedId}를 완료 처리했습니다. Chat Mode로 복귀합니다.` };
          }
          default:
            return { ok: false, message: `알 수 없는 subcommand: ${sub}` };
        }
      } catch (err) {
        return {
          ok: false,
          message: `Task 명령 처리 중 오류: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    [taskId],
  );

  return {
    messages,
    isLoading,
    error,
    conversationId,
    setConversationId,
    setMessages,
    sendMessage,
    editMessage,
    regenerate,
    rewindTo,
    forkAt,
    stopGeneration,
    clearMessages,
    addSystemMessage,
    loadConversation,
    saveToServer,
    pendingApproval,
    respondToApproval,
    pendingPlan,
    approvePlan,
    requestPlanRevision,
    cancelPlan,
    taskId,
    setTaskId,
    taskMode,
    setTaskMode,
    handleTaskCommand,
  };
}
