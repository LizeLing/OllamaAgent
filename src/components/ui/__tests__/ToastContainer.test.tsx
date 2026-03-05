import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import ToastContainer from '../ToastContainer';
import { addToast } from '@/hooks/useToast';

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any leftover toasts from previous tests by advancing timers
    vi.advanceTimersByTime(10000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast when added', () => {
    render(<ToastContainer />);
    act(() => addToast('error', 'Something went wrong'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('removes toast on close button click', () => {
    render(<ToastContainer />);
    act(() => addToast('info', 'Test message'));
    expect(screen.getByText('Test message')).toBeInTheDocument();
    // Find the close button within the toast that contains 'Test message'
    const toastEl = screen.getByText('Test message').closest('div[class*="flex items-start"]') as HTMLElement;
    const closeBtn = within(toastEl).getByText('\u00D7');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Test message')).not.toBeInTheDocument();
  });

  it('auto-removes toast after 5 seconds', () => {
    render(<ToastContainer />);
    act(() => addToast('warning', 'Temporary'));
    expect(screen.getByText('Temporary')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
  });
});
