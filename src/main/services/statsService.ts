import type { Database } from '../db/database';
import { addDays, daysInMonth, isValidDate } from '../../shared/dates';
import type { DaySummary, MonthSummary, ReasonCount, TaskStatus, WeeklyStats } from '../../shared/types';
import { invalid } from '../errors';
import { emptyCounts } from './taskService';
import { requireDate, requireObject } from './validate';

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const REPEAT_POSTPONE_MIN = 2;

interface CountRow {
  task_date: string;
  status: TaskStatus;
  n: number;
}

/** 달력 요약(API-09)과 주간 통계(API-10). 집계 기준은 할 일의 날짜(task_date)다. */
export class StatsService {
  constructor(private readonly db: Database) {}

  monthSummary(raw: unknown): MonthSummary {
    const month = requireObject(raw).month;
    const match = typeof month === 'string' ? MONTH_RE.exec(month) : null;
    if (!match || !isValidDate(`${month}-01`)) throw invalid('월 형식이 올바르지 않습니다.');
    const start = `${month}-01`;
    const end = `${month}-${String(daysInMonth(Number(match[1]), Number(match[2]))).padStart(2, '0')}`;

    const byDate = new Map<string, DaySummary>();
    for (const row of this.countByDateStatus(start, end)) {
      const day = byDate.get(row.task_date) ?? { date: row.task_date, total: 0, ...emptyCounts() };
      day[row.status] += Number(row.n);
      day.total += Number(row.n);
      byDate.set(row.task_date, day);
    }
    return { month: month as string, days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }

  weekly(raw: unknown): WeeklyStats {
    const start = requireDate(requireObject(raw).weekStart, '주 시작일');
    const end = addDays(start, 6);

    const totals = { ...emptyCounts(), total: 0 };
    const byDay = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), ...emptyCounts() }));
    for (const row of this.countByDateStatus(start, end)) {
      const n = Number(row.n);
      totals[row.status] += n;
      totals.total += n;
      const day = byDay.find((d) => d.date === row.task_date);
      if (day) day[row.status] += n;
    }
    const denominator = totals.total - totals.canceled;
    const completionRate = denominator > 0 ? Math.round((totals.done / denominator) * 100) : 0;

    return {
      range: { start, end },
      totals,
      completionRate,
      byDay,
      postponeReasons: this.reasonCounts('postponed', start, end),
      cancelReasons: this.reasonCounts('canceled', start, end),
      repeatedlyPostponed: this.repeatedlyPostponed(start, end),
    };
  }

  private countByDateStatus(start: string, end: string): CountRow[] {
    return this.db.all<CountRow>(
      `SELECT task_date, status, COUNT(*) AS n FROM task
       WHERE task_date BETWEEN ? AND ? GROUP BY task_date, status`,
      [start, end],
    );
  }

  private reasonCounts(status: TaskStatus, start: string, end: string): ReasonCount[] {
    return this.db
      .all<{ reason: string; n: number }>(
        `SELECT status_reason AS reason, COUNT(*) AS n FROM task
         WHERE status = ? AND status_reason IS NOT NULL AND task_date BETWEEN ? AND ?
         GROUP BY status_reason ORDER BY n DESC, reason`,
        [status, start, end],
      )
      .map((row) => ({ reason: row.reason, count: Number(row.n) }));
  }

  /** 이번 주에 있는 연기 체인의 마지막 할 일 중, 원본을 따라 2회 이상 연기된 것. */
  private repeatedlyPostponed(start: string, end: string): WeeklyStats['repeatedlyPostponed'] {
    const tails = this.db.all<{ id: number; title: string }>(
      `SELECT t.id, t.title FROM task t
       WHERE t.task_date BETWEEN ? AND ? AND t.postponed_from_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM task c WHERE c.postponed_from_id = t.id)`,
      [start, end],
    );
    const result: WeeklyStats['repeatedlyPostponed'] = [];
    for (const tail of tails) {
      const count = this.ancestorCount(tail.id);
      if (count >= REPEAT_POSTPONE_MIN) result.push({ title: tail.title, count, latestTaskId: tail.id });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  private ancestorCount(id: number): number {
    let count = 0;
    let current: number | null = id;
    const seen = new Set<number>();
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      const row: { postponed_from_id: number | null } | undefined = this.db.get(
        'SELECT postponed_from_id FROM task WHERE id = ?',
        [current],
      );
      current = row?.postponed_from_id ?? null;
      if (current !== null) count++;
    }
    return count;
  }
}
