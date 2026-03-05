import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

describe('useToast', () => {
  let useToast: typeof import('../../hooks/useToast').useToast;
  let addToast: typeof import('../../hooks/useToast').addToast;
  let removeToast: typeof import('../../hooks/useToast').removeToast;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('../../hooks/useToast');
    useToast = mod.useToast;
    addToast = mod.addToast;
    removeToast = mod.removeToast;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty toasts', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('adds toast via global addToast', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('error', 'test error'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[0].message).toBe('test error');
  });

  it('auto-removes toast after 5 seconds', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('info', 'temporary'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('manually removes toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('warning', 'removable'));
    const id = result.current.toasts[0].id;
    act(() => removeToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });
});
