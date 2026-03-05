import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from '../ChatInput';

vi.mock('@/components/voice/VoiceButton', () => ({
  default: () => <button data-testid="voice-btn">Voice</button>,
}));

vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    isRecording: false,
    isTranscribing: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(''),
  }),
}));

describe('ChatInput', () => {
  it('sends message on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('does not send empty message', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('allows newline with Shift+Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    expect(textarea).toBeDisabled();
  });
});
