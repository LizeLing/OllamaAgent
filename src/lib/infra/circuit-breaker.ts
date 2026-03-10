import { logger } from '@/lib/logger';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** 연속 실패 N회 시 OPEN으로 전환 */
  failureThreshold: number;
  /** OPEN 상태에서 이 시간(ms) 후 HALF_OPEN으로 전환 */
  resetTimeoutMs: number;
  /** 디버깅용 이름 */
  name?: string;
}

/**
 * Circuit Breaker 패턴 구현.
 *
 * 3가지 상태:
 * - CLOSED: 정상 동작. 실패가 누적되면 OPEN으로 전환
 * - OPEN: 모든 호출을 즉시 거부. resetTimeoutMs 후 HALF_OPEN으로 전환
 * - HALF_OPEN: 시험 호출 허용. 성공 시 CLOSED, 실패 시 OPEN
 */
export class CircuitBreaker {
  private _state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = { name: 'default', ...options };
  }

  /** 현재 상태를 반환. OPEN + resetTimeout 경과 시 자동으로 HALF_OPEN 전환 */
  get state(): CircuitBreakerState {
    if (
      this._state === 'OPEN' &&
      Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs
    ) {
      this._state = 'HALF_OPEN';
      logger.info('CIRCUIT_BREAKER', `${this.options.name}: OPEN → HALF_OPEN`);
    }
    return this._state;
  }

  /**
   * fn을 Circuit Breaker로 감싸 실행.
   * OPEN 상태에서는 fn을 호출하지 않고 즉시 에러를 throw한다.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.state;

    if (currentState === 'OPEN') {
      throw new Error(`Circuit breaker OPEN: ${this.options.name}`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** 강제로 CLOSED 상태로 복귀 */
  reset(): void {
    this._state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    logger.info('CIRCUIT_BREAKER', `${this.options.name}: 강제 리셋 → CLOSED`);
  }

  private onSuccess(): void {
    if (this._state === 'HALF_OPEN') {
      logger.info('CIRCUIT_BREAKER', `${this.options.name}: HALF_OPEN → CLOSED`);
    }
    this.failureCount = 0;
    this._state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this._state === 'HALF_OPEN') {
      // HALF_OPEN에서 실패하면 즉시 OPEN
      this._state = 'OPEN';
      logger.warn(
        'CIRCUIT_BREAKER',
        `${this.options.name}: HALF_OPEN → OPEN (시험 호출 실패)`
      );
    } else if (this.failureCount >= this.options.failureThreshold) {
      this._state = 'OPEN';
      logger.warn(
        'CIRCUIT_BREAKER',
        `${this.options.name}: CLOSED → OPEN (연속 ${this.failureCount}회 실패)`
      );
    }
  }
}
