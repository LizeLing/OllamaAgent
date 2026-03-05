import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PresetSelector from '../PresetSelector';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ presets: undefined }),
  });
});

describe('PresetSelector', () => {
  it('renders default preset options', () => {
    render(<PresetSelector onSelect={vi.fn()} />);
    expect(screen.getByText('코딩 어시스턴트')).toBeInTheDocument();
    expect(screen.getByText('리서치')).toBeInTheDocument();
    expect(screen.getByText('일반')).toBeInTheDocument();
  });

  it('calls onSelect with preset data when clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(<PresetSelector onSelect={onSelect} />);
    const button = container.querySelector('button');
    fireEvent.click(button!);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        activePresetId: 'coding',
      })
    );
  });

  it('highlights active preset', () => {
    render(<PresetSelector activePresetId="research" onSelect={vi.fn()} />);
    const btns = screen.getAllByText('리서치');
    const button = btns[0].closest('button');
    expect(button?.className).toContain('border-accent');
  });
});
