import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolApprovalModal from '../ToolApprovalModal';

const defaultProps = {
  toolName: 'code_execute',
  toolInput: { command: 'ls -la' },
  confirmId: 'confirm-123',
  onRespond: vi.fn(),
};

describe('ToolApprovalModal', () => {
  it('shows tool name and arguments', () => {
    render(<ToolApprovalModal {...defaultProps} />);
    expect(screen.getByText('code_execute')).toBeInTheDocument();
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
    expect(screen.getByText('도구 실행 승인')).toBeInTheDocument();
  });

  it('calls onRespond with approved=true when approve button clicked', () => {
    const onRespond = vi.fn();
    const { container } = render(<ToolApprovalModal {...defaultProps} onRespond={onRespond} />);
    const buttons = container.querySelectorAll('button');
    // Approve button is first, deny is second in the flex container
    fireEvent.click(buttons[0]);
    expect(onRespond).toHaveBeenCalledWith('confirm-123', true);
  });

  it('calls onRespond with approved=false when deny button clicked', () => {
    const onRespond = vi.fn();
    const { container } = render(<ToolApprovalModal {...defaultProps} onRespond={onRespond} />);
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]);
    expect(onRespond).toHaveBeenCalledWith('confirm-123', false);
  });

  it('renders the modal overlay', () => {
    const { container } = render(<ToolApprovalModal {...defaultProps} />);
    // The modal has a fixed overlay with bg-black/50
    const overlay = container.firstElementChild;
    expect(overlay).toHaveClass('fixed');
  });
});
