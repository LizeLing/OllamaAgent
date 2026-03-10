import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from '../SettingsPanel';
import { Settings } from '@/types/settings';

vi.mock('../tabs/GeneralTab', () => ({ default: () => <div data-testid="general-tab" /> }));
vi.mock('../tabs/ModelTab', () => ({ default: () => <div data-testid="model-tab" /> }));
vi.mock('../tabs/SecurityTab', () => ({ default: () => <div data-testid="security-tab" /> }));
vi.mock('../tabs/ExtensionsTab', () => ({ default: () => <div data-testid="extensions-tab" /> }));
vi.mock('../tabs/AutomationTab', () => ({ default: () => <div data-testid="automation-tab" /> }));

const settings: Settings = {
  systemPrompt: 'test prompt',
  maxIterations: 10,
  allowedPaths: [],
  deniedPaths: [],
  responseLanguage: 'ko',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen:7b',
  embeddingModel: 'nomic-embed',
  imageModel: 'sd',
  searxngUrl: '',
  autoReadResponses: false,
  ttsVoice: '',
  toolApprovalMode: 'auto',
  customTools: [],
  mcpServers: [],
  modelOptions: { temperature: 0.7, topP: 0.9, numPredict: 2048 },
  fallbackModels: [],
  thinkingMode: 'auto',
  thinkingForToolCalls: false,
  webSearchProvider: 'searxng',
  ollamaApiKey: '',
  enabledTools: [],
  numParallel: 1,
  maxLoadedModels: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPanel', () => {
  it('returns null when settings is null', () => {
    const { container } = render(<SettingsPanel onClose={vi.fn()} settings={null} onSave={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when settings provided', () => {
    render(<SettingsPanel onClose={vi.fn()} settings={settings} onSave={vi.fn()} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Save Settings')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} settings={settings} onSave={vi.fn()} />);
    const closeBtn = screen.getByText('돌아가기');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSave when save button clicked', () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<SettingsPanel onClose={vi.fn()} settings={settings} onSave={onSave} />);
    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalled();
  });

  it('renders general tab by default', () => {
    const { container } = render(<SettingsPanel onClose={vi.fn()} settings={settings} onSave={vi.fn()} />);
    expect(container.querySelector('[data-testid="general-tab"]')).toBeTruthy();
  });
});
