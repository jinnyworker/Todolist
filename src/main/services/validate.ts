import { isValidDate } from '../../shared/dates';
import { PRIORITIES, TASK_STATUSES, type Priority, type TaskStatus } from '../../shared/types';
import { invalid } from '../errors';

/** IPC로 들어온 값은 신뢰하지 않고 Main에서 다시 검증한다. */

export function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${label}을(를) 입력하세요.`);
  const text = value.trim();
  if (text.length > max) throw invalid(`${label}은(는) ${max.toLocaleString()}자까지 입력할 수 있습니다.`);
  return text;
}

export function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid(`${label} 형식이 올바르지 않습니다.`);
  if (value.length > max) throw invalid(`${label}은(는) ${max.toLocaleString()}자까지 입력할 수 있습니다.`);
  return value;
}

export function requireDate(value: unknown, label = '날짜'): string {
  if (!isValidDate(value)) throw invalid(`${label} 형식이 올바르지 않습니다.`);
  return value;
}

export function optionalDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireDate(value, label);
}

export function optionalDateTime(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw invalid(`${label} 형식이 올바르지 않습니다.`);
  }
  return new Date(value).toISOString();
}

export function requireId(value: unknown, label = 'ID'): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw invalid(`${label}가 올바르지 않습니다.`);
  return value as number;
}

export function requirePriority(value: unknown): Priority {
  if (!PRIORITIES.includes(value as Priority)) throw invalid('우선순위 값이 올바르지 않습니다.');
  return value as Priority;
}

export function requireStatus(value: unknown): TaskStatus {
  if (!TASK_STATUSES.includes(value as TaskStatus)) throw invalid('상태 값이 올바르지 않습니다.');
  return value as TaskStatus;
}

export function requireIdList(value: unknown, label: string, max: number): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${label} 형식이 올바르지 않습니다.`);
  const ids = [...new Set(value.map((v) => requireId(v, label)))];
  if (ids.length > max) throw invalid(`${label}은(는) ${max}개까지 지정할 수 있습니다.`);
  return ids;
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid('요청 형식이 올바르지 않습니다.');
  }
  return value as Record<string, unknown>;
}

export const nowIso = (): string => new Date().toISOString();
