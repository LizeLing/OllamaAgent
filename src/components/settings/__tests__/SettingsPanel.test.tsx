import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from '../SettingsPanel';
import { Settings } from '@/types/settings';

vi.mock('../SystemPromptEditor', () => ({ default: () => <div data-testid="system-prompt-editor" /> }));
vi.mock('../PathConfigEditor', () => ({ default: () => <div data-testid="path-config" /> }));
vi.mock('../PresetSelector', () => ({ default: () => <div data-testid="preset-selector" /> }));
vi.mock('../CustomToolEditor', () => ({ default: () => <div data-testid="custom-tool-editor" /> }));
vi.mock('../McpServerManager', () => ({ default: () => <div data-testid="mcp-manager" /> }));
vi.mock('../ModelOptionsSliders', () => ({ default: () => <div data-testid="model-sliders" /> }));

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
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ models: [], voices: [] }) });
});

describe('SettingsPanel', () => {
  it('returns null when not open', () => {
    const { container } = render(<SettingsPanel isOpen={false} onClose={vi.fn()} settings={settings} onSave={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when open', () => {
    render(<SettingsPanel isOpen={true} onClose={vi.fn()} settings={settings} onSave={vi.fn()} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Save Settings')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<SettingsPanel isOpen={true} onClose={onClose} settings={settings} onSave={vi.fn()} />);
    // Find the close button (the one next to the Settings heading)
    const closeBtn = container.querySelector('button');
    fireEvent.click(closeBtn!);
    // onClose is called via backdrop or close button
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSave when save button clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const { container } = render(<SettingsPanel isOpen={true} onClose={vi.fn()} settings={settings} onSave={onSave} />);
    const buttons = container.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find(b => b.textContent?.includes('Save Settings'));
    fireEvent.click(saveBtn!);
    expect(onSave).toHaveBeenCalled();
  });

  it('renders settings sub-components', () => {
    const { container } = render(<SettingsPanel isOpen={true} onClose={vi.fn()} settings={settings} onSave={vi.fn()} />);
    expect(container.querySelector('[data-testid="preset-selector"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="model-sliders"]')).toBeTruthy();
  });
});
