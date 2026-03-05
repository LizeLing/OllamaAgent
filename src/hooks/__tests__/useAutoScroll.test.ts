import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoScroll } from '../useAutoScroll';

describe('useAutoScroll', () => {
  it('returns a ref and scrollToBottom function', () => {
    const { result } = renderHook(() => useAutoScroll<HTMLDivElement>('dep'));
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.scrollToBottom).toBe('function');
  });

  it('ref is initially null', () => {
    const { result } = renderHook(() => useAutoScroll<HTMLDivElement>('dep'));
    expect(result.current.ref.current).toBeNull();
  });

  it('scrollToBottom can be called without error when ref is null', () => {
    const { result } = renderHook(() => useAutoScroll<HTMLDivElement>('dep'));
    expect(() => result.current.scrollToBottom()).not.toThrow();
  });
});
