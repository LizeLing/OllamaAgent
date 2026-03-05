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
});
