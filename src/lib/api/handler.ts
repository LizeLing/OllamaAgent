import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger, getErrorMessage } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouteHandler = (request: NextRequest, context: any) => Promise<NextResponse | Response>;

/**
 * API 라우트 핸들러 래퍼. try-catch + 에러 로깅 + Zod 검증 에러 처리를 일괄 적용한다.
 */
export function withErrorHandler(tag: string, handler: AnyRouteHandler): AnyRouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        logger.error(tag, error.message, { code: error.code });
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }

      // Zod validation errors
      if (error && typeof error === 'object' && 'issues' in error) {
        const zodError = error as { issues: Array<{ message: string; path: (string | number)[] }> };
        logger.warn(tag, 'Validation error', zodError.issues);
        return NextResponse.json(
          { error: 'Validation failed', details: zodError.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
          { status: 400 }
        );
      }

      logger.error(tag, getErrorMessage(error));
      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  };
}
