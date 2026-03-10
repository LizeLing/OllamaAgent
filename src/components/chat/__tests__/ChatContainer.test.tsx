import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatContainer from '../ChatContainer';

// Mock all hooks
vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    regenerate: vi.fn(),
    stopGeneration: vi.fn(),
    clearMessages: vi.fn(),
    conversationId: null,
    setConversationId: vi.fn(),
    loadConversation: vi.fn(),
    saveToServer: vi.fn(),
    pendingApproval: null,
    respondToApproval: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { ollamaModel: 'test-model', modelOptions: { temperature: 0.7, topP: 0.9, numPredict: 2048 } },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    folders: [],
    activeId: null,
    setActiveId: vi.fn(),
    searchQuery: '',
    fetchConversations: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    search: vi.fn(),
    togglePin: vi.fn(),
    moveToFolder: vi.fn(),
    updateTags: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    renameFolder: vi.fn(),
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  addToast: vi.fn(),
}));

vi.mock('../MessageList', () => ({ default: () => <div data-testid="message-list" /> }));
vi.mock('../ChatInput', () => ({ default: ({ onSend }: { onSend: (msg: string) => void }) => <input data-testid="chat-input" onChange={(e) => onSend(e.target.value)} /> }));
vi.mock('@/components/settings/SettingsPanel', () => ({ default: () => null }));
vi.mock('@/components/ui/ThemeToggle', () => ({ default: () => <button data-testid="theme-toggle" /> }));
vi.mock('@/components/sidebar/Sidebar', () => ({ default: () => <aside data-testid="sidebar" /> }));
vi.mock('@/components/chat/ToolApprovalModal', () => ({ default: () => null }));
vi.mock('@/components/ui/ShortcutGuide', () => ({ default: () => null }));
vi.mock('@/components/ui/StatsPanel', () => ({ default: () => null }));
vi.mock('@/components/ui/ToolLogPanel', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ models: [] }) });
  // Mock matchMedia for sidebar default state
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('ChatContainer', () => {
  it('renders main layout elements', () => {
    render(<ChatContainer />);
    expect(screen.getByText('OllamaAgent')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });

  it('renders New Chat button', () => {
    render(<ChatContainer />);
    const btns = screen.getAllByText('New Chat');
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('has sidebar toggle button', () => {
    render(<ChatContainer />);
    const toggleBtns = screen.getAllByTitle('사이드바 토글');
    expect(toggleBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('sidebar toggle button is clickable', () => {
    render(<ChatContainer />);
    const toggleBtns = screen.getAllByTitle('사이드바 토글');
    expect(() => fireEvent.click(toggleBtns[0])).not.toThrow();
  });

  it('renders sidebar toggle button', () => {
    render(<ChatContainer />);
    const toggleBtns = screen.getAllByTitle('사이드바 토글');
    expect(toggleBtns.length).toBeGreaterThanOrEqual(1);
  });
});
