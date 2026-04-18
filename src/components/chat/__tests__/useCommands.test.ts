import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCommands } from '../useCommands';
import type { Message } from '@/types/message';

function createOpts(overrides: Partial<Parameters<typeof useCommands>[0]> = {}) {
  return {
    handleNewChat: vi.fn(),
    clearMessages: vi.fn(),
    addSystemMessage: vi.fn(),
    selectedModel: null,
    ollamaModel: 'llama3',
    availableModels: ['llama3'],
    messages: [] as Message[],
    conversationId: null,
    activeId: null,
    handleExport: vi.fn(),
    handleSend: vi.fn(),
    setSelectedModel: vi.fn(),
    ...overrides,
  };
}

describe('useCommands - /task', () => {
  it('/task 명령어는 handleTaskCommand를 args와 함께 호출한다', async () => {
    const handleTaskCommand = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Task 생성됨', taskId: 'task_1' });
    const addSystemMessage = vi.fn();
    const onTaskCommandSuccess = vi.fn();

    const opts = createOpts({ handleTaskCommand, addSystemMessage, onTaskCommandSuccess });
    const { result } = renderHook(() => useCommands(opts));

    act(() => {
      result.current.handleCommand('task', ['new 목표 정하기']);
    });

    await waitFor(() => expect(handleTaskCommand).toHaveBeenCalledWith(['new 목표 정하기']));
    await waitFor(() => expect(addSystemMessage).toHaveBeenCalledWith('Task 생성됨'));
    await waitFor(() => expect(onTaskCommandSuccess).toHaveBeenCalled());
  });

  it('/task 명령어에서 handleTaskCommand가 없으면 안내 메시지만 렌더한다', () => {
    const addSystemMessage = vi.fn();
    const opts = createOpts({ addSystemMessage, handleTaskCommand: undefined });
    const { result } = renderHook(() => useCommands(opts));

    act(() => {
      result.current.handleCommand('task', ['new 뭔가']);
    });

    expect(addSystemMessage).toHaveBeenCalledWith(expect.stringMatching(/사용할 수 없습니다/));
  });

  it('/task 실패 응답이면 onTaskCommandSuccess는 호출되지 않는다', async () => {
    const handleTaskCommand = vi.fn().mockResolvedValue({ ok: false, message: '실패' });
    const onTaskCommandSuccess = vi.fn();
    const addSystemMessage = vi.fn();
    const opts = createOpts({ handleTaskCommand, addSystemMessage, onTaskCommandSuccess });
    const { result } = renderHook(() => useCommands(opts));

    act(() => {
      result.current.handleCommand('task', ['new']);
    });

    await waitFor(() => expect(handleTaskCommand).toHaveBeenCalled());
    await waitFor(() => expect(addSystemMessage).toHaveBeenCalledWith('실패'));
    expect(onTaskCommandSuccess).not.toHaveBeenCalled();
  });

  it('/task 예외 발생 시 실패 시스템 메시지를 렌더한다', async () => {
    const handleTaskCommand = vi.fn().mockRejectedValue(new Error('network down'));
    const addSystemMessage = vi.fn();
    const opts = createOpts({ handleTaskCommand, addSystemMessage });
    const { result } = renderHook(() => useCommands(opts));

    act(() => {
      result.current.handleCommand('task', ['new 목표']);
    });

    await waitFor(() =>
      expect(addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('network down')),
    );
  });

  it('/new 명령어는 handleNewChat을 호출한다 (기존 동작 회귀 확인)', () => {
    const handleNewChat = vi.fn();
    const opts = createOpts({ handleNewChat });
    const { result } = renderHook(() => useCommands(opts));

    act(() => {
      result.current.handleCommand('new', []);
    });

    expect(handleNewChat).toHaveBeenCalled();
  });
});
