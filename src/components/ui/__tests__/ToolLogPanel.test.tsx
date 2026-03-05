import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ToolLogPanel from '../ToolLogPanel';
import { Message } from '@/types/message';

describe('ToolLogPanel', () => {
  it('returns null when not open', () => {
    const { container } = render(<ToolLogPanel isOpen={false} onClose={vi.fn()} messages={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows empty state when no tool calls', () => {
    render(<ToolLogPanel isOpen={true} onClose={vi.fn()} messages={[]} />);
    expect(screen.getByText('도구 실행 기록이 없습니다')).toBeInTheDocument();
  });

  it('renders tool call logs with timing', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'test',
        timestamp: Date.now(),
        toolCalls: [
          { id: 'tc1', tool: 'filesystem_read', input: { path: '/tmp' }, startTime: 1000, endTime: 2500, success: true, output: 'ok' },
          { id: 'tc2', tool: 'code_execute', input: { cmd: 'ls' }, startTime: 3000, endTime: 3500, success: false, output: 'error' },
        ],
      },
    ];

    render(<ToolLogPanel isOpen={true} onClose={vi.fn()} messages={messages} />);
    expect(screen.getByText('filesystem_read')).toBeInTheDocument();
    expect(screen.getByText('code_execute')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('0.5s')).toBeInTheDocument();
    expect(screen.getByText(/1 성공/)).toBeInTheDocument();
    expect(screen.getByText(/1 실패/)).toBeInTheDocument();
  });
});
