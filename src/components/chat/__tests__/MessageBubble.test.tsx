import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageBubble from '../MessageBubble';
import { Message } from '@/types/message';

// Mock hooks and components
vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    isSpeaking: false,
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  }),
}));

vi.mock('@/components/markdown/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

vi.mock('./ToolCallDisplay', () => ({
  default: () => <div data-testid="tool-call" />,
}));

vi.mock('./ImageDisplay', () => ({
  default: () => <div data-testid="image-display" />,
}));

vi.mock('@/components/voice/AudioPlayer', () => ({
  default: () => <button data-testid="audio-player">Audio</button>,
}));

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'test-1',
  role: 'assistant',
  content: 'Hello world',
  timestamp: Date.now(),
  ...overrides,
});

describe('MessageBubble', () => {
  it('renders user message', () => {
    render(<MessageBubble message={makeMessage({ role: 'user', content: 'Hi' })} />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    render(<MessageBubble message={makeMessage({ content: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows aborted indicator', () => {
    render(<MessageBubble message={makeMessage({ aborted: true })} />);
    expect(screen.getByText('응답이 중단되었습니다')).toBeInTheDocument();
  });

  it('shows error with retry button when isLast', () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({ error: 'Something failed' })}
        onRetry={onRetry}
        isLast
      />
    );
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('재시도'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('calls onBranch when branch button clicked', () => {
    const onBranch = vi.fn();
    render(
      <MessageBubble
        message={makeMessage()}
        onBranch={onBranch}
      />
    );
    const branchBtn = screen.getByTitle('여기서 분기');
    fireEvent.click(branchBtn);
    expect(onBranch).toHaveBeenCalledWith('test-1');
  });

  describe('onRewind action', () => {
    it('assistant 메시지에서 되돌리기 버튼이 렌더되고 onRewind를 호출한다', () => {
      const onRewind = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({ id: 'asst-1', role: 'assistant', content: 'answer' })}
          onRewind={onRewind}
        />
      );
      const buttons = screen.getAllByTitle('여기로 되돌리기');
      expect(buttons.length).toBeGreaterThan(0);
      fireEvent.click(buttons[0]);
      expect(onRewind).toHaveBeenCalledWith('asst-1');
    });

    it('user 메시지에서 되돌리기 버튼이 렌더되고 onRewind를 호출한다', () => {
      const onRewind = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({ id: 'usr-1', role: 'user', content: 'hi' })}
          onRewind={onRewind}
        />
      );
      const buttons = screen.getAllByTitle('여기로 되돌리기');
      expect(buttons.length).toBeGreaterThan(0);
      fireEvent.click(buttons[0]);
      expect(onRewind).toHaveBeenCalledWith('usr-1');
    });

    it('onRewind가 없으면 되돌리기 버튼이 렌더되지 않는다', () => {
      render(<MessageBubble message={makeMessage({ role: 'user', content: 'hi' })} />);
      expect(screen.queryByTitle('여기로 되돌리기')).toBeNull();
    });

    it('assistant 메시지에 onRewind와 onBranch가 함께 있으면 각각 독립 호출된다', () => {
      const onRewind = vi.fn();
      const onBranch = vi.fn();
      render(
        <MessageBubble
          message={makeMessage({ id: 'asst-x', role: 'assistant', content: 'x' })}
          onRewind={onRewind}
          onBranch={onBranch}
        />
      );
      fireEvent.click(screen.getAllByTitle('여기로 되돌리기')[0]);
      fireEvent.click(screen.getAllByTitle('여기서 분기')[0]);
      expect(onRewind).toHaveBeenCalledWith('asst-x');
      expect(onBranch).toHaveBeenCalledWith('asst-x');
    });
  });
});
