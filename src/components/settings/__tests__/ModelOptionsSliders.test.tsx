import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelOptionsSliders from '../ModelOptionsSliders';

const options = { temperature: 0.7, topP: 0.9, numPredict: 2048 };

describe('ModelOptionsSliders', () => {
  it('renders sliders for temperature, topP, numPredict', () => {
    render(<ModelOptionsSliders options={options} onChange={vi.fn()} />);
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Top P')).toBeInTheDocument();
    expect(screen.getByText('Max Tokens')).toBeInTheDocument();
  });

  it('displays current values', () => {
    const { container } = render(<ModelOptionsSliders options={options} onChange={vi.fn()} />);
    // Values are shown in font-mono spans. '0.7' also appears as the min label for temperature.
    // Check that each label + value exists in the output
    const text = container.textContent;
    expect(text).toContain('0.7');
    expect(text).toContain('0.90');
    expect(text).toContain('2048');
  });

  it('calls onChange when slider value changes', () => {
    const onChange = vi.fn();
    const { container } = render(<ModelOptionsSliders options={options} onChange={onChange} />);
    const slider = container.querySelector('input[type="range"]');
    // Fire change event on the range input
    fireEvent.change(slider!, { target: { value: '1.0' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1.0 }));
  });
});
