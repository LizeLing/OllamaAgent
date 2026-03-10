type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, tag: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${message}`;
  if (meta !== undefined) {
    return `${base} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  }
  return base;
}

export const logger = {
  debug(tag: string, message: string, meta?: unknown) {
    if (shouldLog('debug')) console.log(formatMessage('debug', tag, message, meta));
  },
  info(tag: string, message: string, meta?: unknown) {
    if (shouldLog('info')) console.log(formatMessage('info', tag, message, meta));
  },
  warn(tag: string, message: string, meta?: unknown) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', tag, message, meta));
  },
  error(tag: string, message: string, meta?: unknown) {
    if (shouldLog('error')) console.error(formatMessage('error', tag, message, meta));
  },
};

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
