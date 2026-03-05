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

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setConversationId(id);
      }
    } catch {
      // load failed
    }
  }, []);

  const saveToServer = useCallback(async (convId: string, msgs: Message[]) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      });
    } catch {
      // save failed
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

  const sendMessage = useCallback(async (content: string, images?: string[], model?: string) => {
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

    try {
      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, history, images, model }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleSSEEvent(assistantId, eventType, data);
            } catch {
              // skip malformed JSON
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
    }
  }, [messages, handleSSEEvent]);

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

  const respondToApproval = useCallback(async (confirmId: string, approved: boolean) => {
    try {
      await fetch('/api/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmId, approved }),
      });
    } catch {
      // confirm failed
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
  }, []);

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
    stopGeneration,
    clearMessages,
    loadConversation,
    saveToServer,
    pendingApproval,
    respondToApproval,
  };
}
