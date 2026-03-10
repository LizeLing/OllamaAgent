import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar';
import { ConversationMeta } from '@/types/conversation';

const baseProps = {
  conversations: [] as ConversationMeta[],
  folders: [],
  activeId: null,
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onSearch: vi.fn(),
  searchQuery: '',
  isOpen: true,
  onClose: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
  onTogglePin: vi.fn(),
  onMoveToFolder: vi.fn(),
  onCreateFolder: vi.fn(),
  onDeleteFolder: vi.fn(),
  onRenameFolder: vi.fn(),
  onUpdateTags: vi.fn(),
};

const sampleConv: ConversationMeta = {
  id: 'c1',
  title: 'Test Conversation',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messageCount: 5,
};

describe('Sidebar', () => {
  it('shows empty state when no conversations', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText('대화가 없습니다')).toBeInTheDocument();
  });

  it('renders conversation list', () => {
    render(<Sidebar {...baseProps} conversations={[sampleConv]} />);
    expect(screen.getByText('Test Conversation')).toBeInTheDocument();
  });

  it('search input filters and calls onSearch', () => {
    const onSearch = vi.fn();
    const { container } = render(<Sidebar {...baseProps} onSearch={onSearch} />);
    const input = container.querySelector('input[type="search"]');
    fireEvent.change(input!, { target: { value: 'hello' } });
    expect(onSearch).toHaveBeenCalledWith('hello');
  });

  it('new conversation button calls onNew', () => {
    const onNew = vi.fn();
    const { container } = render(<Sidebar {...baseProps} onNew={onNew} />);
    // Find the first button containing "새 대화" text
    const buttons = container.querySelectorAll('button');
    const newBtn = Array.from(buttons).find(b => b.textContent?.includes('새 대화'));
    fireEvent.click(newBtn!);
    expect(onNew).toHaveBeenCalled();
  });

  it('shows no results message when searching with no matches', () => {
    render(<Sidebar {...baseProps} searchQuery="xyz" />);
    expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
  });
});
