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
    const overlay = container.firstElementChild;
    expect(overlay).toHaveClass('fixed');
  });

  // 접근성 테스트
  it('모달 열릴 때 승인 버튼에 포커스가 이동한다', () => {
    render(<ToolApprovalModal {...defaultProps} />);
    const approveBtn = screen.getByLabelText('도구 code_execute 실행 승인');
    expect(document.activeElement).toBe(approveBtn);
  });

  it('ESC 키로 거부 응답을 보낸다', () => {
    const onRespond = vi.fn();
    const { container } = render(<ToolApprovalModal {...defaultProps} onRespond={onRespond} />);
    const dialog = container.firstElementChild!;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onRespond).toHaveBeenCalledWith('confirm-123', false);
  });

  it('aria-label이 도구 이름을 포함한다', () => {
    render(<ToolApprovalModal {...defaultProps} />);
    expect(screen.getByLabelText('도구 code_execute 실행 승인')).toBeInTheDocument();
    expect(screen.getByLabelText('도구 code_execute 실행 거부')).toBeInTheDocument();
  });

  it('Tab 키로 포커스가 모달 내부에서 순환한다', () => {
    const { container } = render(<ToolApprovalModal {...defaultProps} />);
    const dialog = container.firstElementChild!;
    const buttons = container.querySelectorAll('button');
    const approveBtn = buttons[0];
    const denyBtn = buttons[1];

    // 승인 버튼에 포커스
    (approveBtn as HTMLElement).focus();
    expect(document.activeElement).toBe(approveBtn);

    // 거부 버튼에서 Tab → 승인 버튼으로 순환
    (denyBtn as HTMLElement).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(approveBtn);
  });
});
