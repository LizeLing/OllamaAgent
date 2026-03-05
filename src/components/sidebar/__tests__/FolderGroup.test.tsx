import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FolderGroup from '../FolderGroup';

const folder = { id: 'f1', name: 'Work', color: '#6366f1', order: 0 };

describe('FolderGroup', () => {
  it('renders folder name and count', () => {
    render(
      <FolderGroup folder={folder} count={3} onRename={vi.fn()} onDelete={vi.fn()}>
        <div>child items</div>
      </FolderGroup>
    );
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders folder color indicator', () => {
    const { container } = render(
      <FolderGroup folder={folder} count={1} onRename={vi.fn()} onDelete={vi.fn()}>
        <div>child</div>
      </FolderGroup>
    );
    const colorDiv = container.querySelector('[style*="background-color"]');
    expect(colorDiv).toBeTruthy();
  });

  it('toggles children visibility on click', () => {
    const { container } = render(
      <FolderGroup folder={folder} count={2} onRename={vi.fn()} onDelete={vi.fn()}>
        <div data-testid="child">child content</div>
      </FolderGroup>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();

    // The toggle button contains the SVG chevron - get the first button
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();

    // Click again to re-expand
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
