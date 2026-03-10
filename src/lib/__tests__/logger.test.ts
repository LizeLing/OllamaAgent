import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = process.env.LOG_LEVEL;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    process.env.LOG_LEVEL = originalEnv;
    vi.resetModules();
  });

  it('info 레벨에서 debug 메시지를 출력하지 않는다', async () => {
    process.env.LOG_LEVEL = 'info';
    const { logger } = await import('../logger');

    logger.debug('TEST', 'debug message');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('info 레벨에서 info 메시지를 출력한다', async () => {
    process.env.LOG_LEVEL = 'info';
    const { logger } = await import('../logger');

    logger.info('TEST', 'info message');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
  });

  it('error 메시지에 메타 정보를 포함한다', async () => {
    process.env.LOG_LEVEL = 'error';
    const { logger } = await import('../logger');

    logger.error('TEST', 'error occurred', { code: 500 });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('getErrorMessage가 Error 객체에서 메시지를 추출한다', async () => {
    const { getErrorMessage } = await import('../logger');

    expect(getErrorMessage(new Error('test'))).toBe('test');
    expect(getErrorMessage('string error')).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
  });
});
