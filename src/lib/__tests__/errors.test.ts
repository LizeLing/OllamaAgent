import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, errorResponse } from '../errors';

describe('AppError', () => {
  it('message, statusCode, code를 설정한다', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');

    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('AppError');
  });

  it('기본값: 500, INTERNAL_ERROR', () => {
    const err = new AppError('Something failed');

    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('errorResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('AppError를 처리한다', () => {
    const err = new AppError('Bad request', 400, 'BAD_REQUEST');
    const res = errorResponse(err);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad request');
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('일반 Error를 처리한다', () => {
    const err = new Error('generic error');
    const res = errorResponse(err);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});
