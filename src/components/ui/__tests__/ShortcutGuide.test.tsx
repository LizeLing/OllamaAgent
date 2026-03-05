import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShortcutGuide from '../ShortcutGuide';

describe('ShortcutGuide', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutGuide isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders shortcuts when open', () => {
    render(<ShortcutGuide isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('키보드 단축키')).toBeInTheDocument();
    expect(screen.getByText('응답 생성 중단')).toBeInTheDocument();
    expect(screen.getByText('새 대화')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutGuide isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('\u00D7'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutGuide isOpen={true} onClose={onClose} />);
    // The first rendered div is the backdrop
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
