import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Re-import to get fresh module state
let checkRateLimit: typeof import('../rate-limiter').checkRateLimit;

describe('checkRateLimit', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('../rate-limiter');
    checkRateLimit = mod.checkRateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under limit', () => {
    const config = { maxTokens: 3, refillPerSecond: 0 };
    expect(checkRateLimit('test', config)).toBe(true);
    expect(checkRateLimit('test', config)).toBe(true);
    expect(checkRateLimit('test', config)).toBe(true);
  });

  it('blocks requests over limit', () => {
    const config = { maxTokens: 2, refillPerSecond: 0 };
    expect(checkRateLimit('block', config)).toBe(true);
    expect(checkRateLimit('block', config)).toBe(true);
    expect(checkRateLimit('block', config)).toBe(false);
  });

  it('tracks different keys independently', () => {
    const config = { maxTokens: 1, refillPerSecond: 0 };
    expect(checkRateLimit('key1', config)).toBe(true);
    expect(checkRateLimit('key2', config)).toBe(true);
    expect(checkRateLimit('key1', config)).toBe(false);
    expect(checkRateLimit('key2', config)).toBe(false);
  });

  it('refills tokens over time', () => {
    const config = { maxTokens: 2, refillPerSecond: 1 };
    expect(checkRateLimit('refill', config)).toBe(true);
    expect(checkRateLimit('refill', config)).toBe(true);
    expect(checkRateLimit('refill', config)).toBe(false);

    vi.advanceTimersByTime(2000); // 2 seconds = 2 tokens refilled
    expect(checkRateLimit('refill', config)).toBe(true);
  });
});
