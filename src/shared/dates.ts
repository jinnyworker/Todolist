/** 로컬 날짜 문자열(YYYY-MM-DD) 유틸. Main·Renderer 공통. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number): string => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDateString(new Date());
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  return toDateString(parseDate(s)) === s;
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** ISO 요일: 1=월 … 7=일 */
export function isoWeekday(s: string): number {
  const day = parseDate(s).getDay();
  return day === 0 ? 7 : day;
}

export function weekStartOf(s: string): string {
  return addDays(s, 1 - isoWeekday(s));
}

export function weekdayLabel(s: string): string {
  return WEEKDAY_LABELS[parseDate(s).getDay()];
}

/** 2026-10-26 (월) */
export function formatDateLabel(s: string): string {
  return `${s} (${weekdayLabel(s)})`;
}

/** 10/26 */
export function formatShort(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
