/**
 * 파일 경로 기반 비동기 뮤텍스.
 * 동일 파일에 대한 read-modify-write 경쟁 상태를 방지한다.
 */
const locks = new Map<string, Promise<void>>();

export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // 현재 대기 중인 작업이 있으면 기다림
  const prev = locks.get(key) ?? Promise.resolve();

  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(key, next);

  try {
    await prev;
    return await fn();
  } finally {
    resolve!();
    // 마지막 작업이면 Map에서 제거 (메모리 누수 방지)
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}
