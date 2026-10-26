import type { ApiResult, ErrorCode } from '../shared/types';

/** 서비스 계층에서 던지는 도메인 오류. IPC 핸들러가 공통 오류 응답으로 바꾼다. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const invalid = (message: string): AppError => new AppError('INVALID_INPUT', message);
export const notFound = (message = '요청한 데이터를 찾을 수 없습니다.'): AppError =>
  new AppError('NOT_FOUND', message);
export const conflict = (message: string): AppError => new AppError('CONFLICT', message);

export function toResult<T>(fn: () => T): ApiResult<T> {
  try {
    return { success: true, data: fn() };
  } catch (err) {
    return toErrorResult(err);
  }
}

export function toErrorResult(err: unknown): ApiResult<never> {
  const timestamp = new Date().toISOString();
  if (err instanceof AppError) {
    return { success: false, error: { code: err.code, message: err.message, timestamp } };
  }
  // 내부 오류 상세는 로그에만 남기고 화면에는 일반 메시지만 보낸다.
  console.error(err);
  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.', timestamp },
  };
}
