import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImageDisplay from '../ImageDisplay';

describe('ImageDisplay', () => {
  it('renders image from base64 data', () => {
    render(<ImageDisplay image={{ base64: 'abc123', prompt: 'a cat' }} />);
    const img = screen.getByAltText('a cat');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
  });

  it('shows prompt text', () => {
    render(<ImageDisplay image={{ base64: 'abc123', prompt: 'a landscape' }} />);
    expect(screen.getByText('a landscape')).toBeInTheDocument();
  });

  it('renders download button in overlay', () => {
    const { container } = render(<ImageDisplay image={{ base64: 'abc', prompt: 'test' }} />);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toBe('Download');
  });
});
