import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
  });

  it('CLOSED 상태에서 성공하면 CLOSED 유지', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.state).toBe('CLOSED');
  });

  it('failureThreshold 도달 시 OPEN으로 전환', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.state).toBe('OPEN');
  });

  it('OPEN 상태에서는 fn을 호출하지 않고 즉시 에러', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    const fn = vi.fn(() => Promise.resolve('ok'));
    await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('failureThreshold 미만이면 CLOSED 유지', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 2; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.state).toBe('CLOSED');
  });

  it('성공하면 실패 카운트가 리셋된다', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    // 2번 실패
    await breaker.execute(fail).catch(() => {});
    await breaker.execute(fail).catch(() => {});
    // 1번 성공 → 카운트 리셋
    await breaker.execute(() => Promise.resolve('ok'));
    // 2번 더 실패해도 CLOSED (연속 실패가 아니므로)
    await breaker.execute(fail).catch(() => {});
    await breaker.execute(fail).catch(() => {});
    expect(breaker.state).toBe('CLOSED');
  });

  it('resetTimeout 후 HALF_OPEN으로 전환', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.state).toBe('OPEN');
    vi.advanceTimersByTime(1100);
    expect(breaker.state).toBe('HALF_OPEN');
    vi.useRealTimers();
  });

  it('HALF_OPEN에서 성공하면 CLOSED로 복귀', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    vi.advanceTimersByTime(1100);
    expect(breaker.state).toBe('HALF_OPEN');
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.state).toBe('CLOSED');
    vi.useRealTimers();
  });

  it('HALF_OPEN에서 실패하면 다시 OPEN', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    vi.advanceTimersByTime(1100);
    expect(breaker.state).toBe('HALF_OPEN');
    await breaker.execute(fail).catch(() => {});
    expect(breaker.state).toBe('OPEN');
    vi.useRealTimers();
  });

  it('reset()으로 강제 CLOSED 복귀', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.state).toBe('OPEN');
    breaker.reset();
    expect(breaker.state).toBe('CLOSED');
    // reset 후 정상 호출 가능
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  it('name 옵션이 에러 메시지에 포함된다', async () => {
    const named = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      name: 'ollama',
    });
    await named.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await expect(named.execute(() => Promise.resolve('ok'))).rejects.toThrow('ollama');
  });
});
