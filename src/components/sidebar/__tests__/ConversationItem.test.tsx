import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationItem from '../ConversationItem';
import { ConversationMeta } from '@/types/conversation';

const conv: ConversationMeta = {
  id: 'c1',
  title: 'My Conversation',
  createdAt: Date.now() - 60000,
  updatedAt: Date.now() - 60000,
  messageCount: 3,
  tags: ['react', 'test', 'vitest'],
};

const baseProps = {
  conversation: conv,
  isActive: false,
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onTogglePin: vi.fn(),
  onMoveToFolder: vi.fn(),
  onUpdateTags: vi.fn(),
  folders: [],
};

describe('ConversationItem', () => {
  it('renders title', () => {
    render(<ConversationItem {...baseProps} />);
    expect(screen.getByText('My Conversation')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(<ConversationItem {...baseProps} onSelect={onSelect} />);
    // Click the outer clickable div directly
    const clickableDiv = container.querySelector('.cursor-pointer');
    fireEvent.click(clickableDiv!);
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('shows tags (max 2 displayed inline)', () => {
    render(<ConversationItem {...baseProps} />);
    // Tags are rendered as small spans
    const allText = document.body.textContent;
    expect(allText).toContain('react');
    expect(allText).toContain('test');
    expect(allText).toContain('+1');
  });

  it('shows pinned indicator when pinned', () => {
    const pinnedConv = { ...conv, pinned: true };
    render(<ConversationItem {...baseProps} conversation={pinnedConv} />);
    expect(screen.getByTitle('고정됨')).toBeInTheDocument();
  });

  it('applies active styling when isActive', () => {
    const { container } = render(<ConversationItem {...baseProps} isActive={true} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('bg-accent/20');
  });
});
