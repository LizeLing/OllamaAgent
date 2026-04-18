'use client';

import { useCallback } from 'react';
import { COMMANDS } from '@/lib/commands/definitions';
import { Message } from '@/types/message';
import type { TaskCommandResult } from '@/hooks/useChat';

interface UseCommandsOptions {
  handleNewChat: () => void;
  clearMessages: () => void;
  addSystemMessage: (content: string) => void;
  selectedModel: string | null;
  ollamaModel: string;
  availableModels: string[];
  messages: Message[];
  conversationId: string | null;
  activeId: string | null;
  handleExport: (id: string, format: 'json' | 'markdown') => void;
  handleSend: (msg: string, imgs?: string[]) => void;
  setSelectedModel: (m: string | null) => void;
  handleTaskCommand?: (args: string[]) => Promise<TaskCommandResult>;
  onTaskCommandSuccess?: (result: TaskCommandResult) => void;
}

export function useCommands({
  handleNewChat,
  clearMessages,
  addSystemMessage,
  selectedModel,
  ollamaModel,
  availableModels,
  messages,
  conversationId,
  activeId,
  handleExport,
  handleSend,
  setSelectedModel,
  handleTaskCommand,
  onTaskCommandSuccess,
}: UseCommandsOptions) {
  const handleCommand = useCallback((name: string, args: string[]) => {
    if (name === 'task') {
      if (!handleTaskCommand) {
        addSystemMessage('Task Mode를 사용할 수 없습니다.');
        return;
      }
      handleTaskCommand(args)
        .then((result) => {
          addSystemMessage(result.message);
          if (result.ok) {
            onTaskCommandSuccess?.(result);
          }
        })
        .catch((err) => {
          addSystemMessage(`Task 명령 처리 실패: ${err instanceof Error ? err.message : String(err)}`);
        });
      return;
    }
    switch (name) {
      case 'new':
        handleNewChat();
        break;
      case 'clear':
        clearMessages();
        addSystemMessage('대화가 초기화되었습니다.');
        break;
      case 'model':
        if (args[0]) {
          setSelectedModel(args[0]);
          addSystemMessage(`모델이 ${args[0]}으로 변경되었습니다.`);
        } else {
          addSystemMessage(`현재 모델: ${selectedModel || ollamaModel || '없음'}\n사용 가능: ${availableModels.join(', ')}`);
        }
        break;
      case 'help': {
        const helpText = COMMANDS.map(
          (c) => `**/${c.name}** — ${c.description}`
        ).join('\n');
        addSystemMessage(`## 명령어 목록\n\n${helpText}`);
        break;
      }
      case 'stats': {
        const totalTokens = messages.reduce(
          (sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0
        );
        addSystemMessage(
          `## 세션 통계\n\n` +
          `- 메시지 수: ${messages.length}\n` +
          `- 총 토큰: ${totalTokens}\n` +
          `- 모델: ${selectedModel || ollamaModel || '없음'}\n` +
          `- 대화 ID: ${conversationId || '없음'}`
        );
        break;
      }
      case 'export':
        if (activeId) {
          handleExport(activeId, (args[0] as 'json' | 'markdown') || 'json');
        } else {
          addSystemMessage('내보낼 대화가 없습니다.');
        }
        break;
      case 'system':
        if (args[0]) {
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: args[0] }),
          }).then(() => {
            addSystemMessage(`시스템 프롬프트가 변경되었습니다.`);
          }).catch(() => {
            addSystemMessage('시스템 프롬프트 변경에 실패했습니다.');
          });
        }
        break;
      case 'skill':
        if (args[0]) {
          // 스킬 이름으로 실행
          fetch('/api/skills')
            .then((r) => r.json())
            .then((data) => {
              const skills: Array<{ id: string; name: string; triggerCommand?: string; icon?: string; description: string }> = data.skills || data;
              const skill = skills.find(
                (s) => s.triggerCommand === args[0] || s.name === args[0] || s.id === args[0]
              );
              if (skill) {
                addSystemMessage(`스킬 "${skill.icon || '📋'} ${skill.name}" 실행 중...`);
                handleSend(`[스킬 실행: ${skill.name}] ${args.slice(1).join(' ') || skill.description}`);
              } else {
                addSystemMessage(`스킬 "${args[0]}"을 찾을 수 없습니다.`);
              }
            })
            .catch(() => addSystemMessage('스킬 목록을 불러올 수 없습니다.'));
        } else {
          // 스킬 목록 표시
          fetch('/api/skills')
            .then((r) => r.json())
            .then((data) => {
              const skills: Array<{ icon?: string; name: string; triggerCommand?: string; description: string; workflow: unknown[] }> = data.skills || data;
              if (skills.length === 0) {
                addSystemMessage('등록된 스킬이 없습니다.');
              } else {
                const list = skills.map(
                  (s) => `- ${s.icon || '📋'} **${s.name}**${s.triggerCommand ? ` (\`/skill ${s.triggerCommand}\`)` : ''} — ${s.description} (${s.workflow.length}단계)`
                ).join('\n');
                addSystemMessage(`## 사용 가능한 스킬\n\n${list}\n\n실행: \`/skill <이름>\``);
              }
            })
            .catch(() => addSystemMessage('스킬 목록을 불러올 수 없습니다.'));
        }
        break;
    }
  }, [handleNewChat, clearMessages, addSystemMessage, selectedModel, ollamaModel, availableModels, messages, conversationId, activeId, handleExport, handleSend, setSelectedModel, handleTaskCommand, onTaskCommandSuccess]);

  return { handleCommand };
}
