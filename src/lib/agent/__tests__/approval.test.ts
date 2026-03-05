import { describe, it, expect, vi } from 'vitest';
import { waitForApproval, resolveApproval } from '../approval';

describe('approval', () => {
  it('resolveApproval returns true when pending approval exists', async () => {
    const promise = waitForApproval('test-1');
    const found = resolveApproval('test-1', true);
    expect(found).toBe(true);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolveApproval returns false when no pending approval', () => {
    const found = resolveApproval('nonexistent', true);
    expect(found).toBe(false);
  });

  it('waitForApproval times out after 60s and resolves false', async () => {
    vi.useFakeTimers();
    const promise = waitForApproval('timeout-test');
    vi.advanceTimersByTime(61000);
    const result = await promise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it('resolveApproval with denied returns false to waiter', async () => {
    const promise = waitForApproval('deny-test');
    resolveApproval('deny-test', false);
    const result = await promise;
    expect(result).toBe(false);
  });
});
