import type { ApiResult, ErrorCode } from '@shared/types';

export const api = window.electronAPI;

export class ApiCallError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** 공통 응답을 풀어 데이터만 돌려준다. 실패면 ApiCallError를 던진다. */
export async function call<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const result = await request;
  if (!result.success) throw new ApiCallError(result.error.code, result.error.message);
  return result.data;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.';
}

export const isCanceled = (err: unknown): boolean => err instanceof ApiCallError && err.code === 'CANCELED';
