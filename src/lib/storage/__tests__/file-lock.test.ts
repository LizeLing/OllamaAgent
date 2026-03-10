import { describe, it, expect } from 'vitest';
import { withFileLock } from '../file-lock';

describe('withFileLock', () => {
  it('동일 키에 대해 순차 실행을 보장한다', async () => {
    const order: number[] = [];

    const task1 = withFileLock('test-key', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 'a';
    });

    const task2 = withFileLock('test-key', async () => {
      order.push(2);
      return 'b';
    });

    const [r1, r2] = await Promise.all([task1, task2]);

    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(order).toEqual([1, 2]);
  });

  it('다른 키는 병렬로 실행된다', async () => {
    const start = Date.now();

    const task1 = withFileLock('key-a', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'a';
    });

    const task2 = withFileLock('key-b', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'b';
    });

    await Promise.all([task1, task2]);
    const elapsed = Date.now() - start;

    // 병렬이므로 100ms보다 빨라야 함
    expect(elapsed).toBeLessThan(90);
  });

  it('에러 발생 시에도 락이 해제된다', async () => {
    await expect(
      withFileLock('err-key', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');

    // 이후 작업이 정상 실행되어야 함
    const result = await withFileLock('err-key', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('3개 이상 순차 대기 시 올바른 순서를 유지한다', async () => {
    const order: number[] = [];

    const tasks = [1, 2, 3, 4, 5].map((n) =>
      withFileLock('seq-key', async () => {
        order.push(n);
      })
    );

    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });
});
