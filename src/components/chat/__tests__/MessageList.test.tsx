import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from '../MessageList';

vi.mock('@/hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ ref: { current: null } }),
}));

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

vi.mock('../ToolCallDisplay', () => ({
  default: () => <div data-testid="tool-call" />,
}));

vi.mock('../ImageDisplay', () => ({
  default: () => <div data-testid="image-display" />,
}));

vi.mock('@/components/voice/AudioPlayer', () => ({
  default: () => <button data-testid="audio-player">Audio</button>,
}));

describe('MessageList', () => {
  it('shows suggestions when empty', () => {
    render(<MessageList messages={[]} isLoading={false} />);
    expect(screen.getByText('무엇이든 물어보세요')).toBeInTheDocument();
    expect(screen.getByText('코드 작성')).toBeInTheDocument();
    expect(screen.getByText('웹 검색')).toBeInTheDocument();
  });

  it('calls onSend when suggestion clicked', () => {
    const onSend = vi.fn();
    render(<MessageList messages={[]} isLoading={false} onSend={onSend} />);
    fireEvent.click(screen.getByText('코드 작성'));
    expect(onSend).toHaveBeenCalledWith('Python으로 간단한 웹 스크래퍼를 만들어주세요');
  });

  it('renders messages when provided', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
      { id: '2', role: 'assistant' as const, content: 'Hi there', timestamp: Date.now() },
    ];
    render(<MessageList messages={messages} isLoading={false} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: '', timestamp: Date.now() },
    ];
    render(<MessageList messages={messages} isLoading={true} />);
    expect(screen.getByText('생각하고 있습니다...')).toBeInTheDocument();
  });
});
