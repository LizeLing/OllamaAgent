export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorResponse(error: unknown, defaultMessage: string = 'Internal server error') {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`);
    return {
      body: { error: error.message, code: error.code },
      status: error.statusCode,
    };
  }

  const message = error instanceof Error ? error.message : defaultMessage;
  console.error(`[INTERNAL_ERROR] ${message}`);
  return {
    body: { error: defaultMessage, code: 'INTERNAL_ERROR' },
    status: 500,
  };
}
