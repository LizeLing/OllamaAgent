import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolCallDisplay from '../ToolCallDisplay';
import { ToolCallInfo } from '@/types/message';

const baseTool: ToolCallInfo = {
  id: 'tc-1',
  tool: 'filesystem_read',
  input: { path: '/tmp/test.txt' },
  startTime: 1000,
};

describe('ToolCallDisplay', () => {
  it('renders tool name and running status', () => {
    render(<ToolCallDisplay toolCall={baseTool} />);
    expect(screen.getByText('filesystem_read')).toBeInTheDocument();
    expect(screen.getByText('⏳')).toBeInTheDocument();
  });

  it('shows success indicator and duration when completed', () => {
    const completed: ToolCallInfo = { ...baseTool, success: true, endTime: 1250, output: 'file content' };
    render(<ToolCallDisplay toolCall={completed} />);
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('250ms')).toBeInTheDocument();
  });

  it('shows failure indicator', () => {
    const failed: ToolCallInfo = { ...baseTool, success: false, endTime: 1100, output: 'error' };
    render(<ToolCallDisplay toolCall={failed} />);
    expect(screen.getByText('❌')).toBeInTheDocument();
  });

  it('shows input/output when expanded', () => {
    const completed: ToolCallInfo = { ...baseTool, success: true, endTime: 1200, output: 'result data' };
    const { container } = render(<ToolCallDisplay toolCall={completed} />);

    // Click the expand button
    const button = container.querySelector('button');
    fireEvent.click(button!);
    const text = container.textContent;
    expect(text).toContain('Input:');
    expect(text).toContain('Output:');
    expect(text).toContain('result data');
  });
});
