import { formatDateLabel, formatShort } from '../../shared/dates';
import type { Task, WeeklyStats } from '../../shared/types';
import { notFound } from '../errors';
import type { StatsService } from './statsService';
import type { TaskService } from './taskService';

const STATUS_MARK: Record<Task['status'], string> = {
  done: '☑',
  waiting: '☐',
  in_progress: '☐',
  postponed: '⤳',
  canceled: '✕',
};
const PRIORITY_MARK: Record<Task['priority'], string> = { high: '▲ ', normal: '', low: '▼ ' };

/** 공유용 텍스트(REQ-17)를 만든다. 이미지 캡처는 Main의 IPC 핸들러가 맡는다. */
export class ShareService {
  constructor(
    private readonly tasks: TaskService,
    private readonly stats: StatsService,
  ) {}

  dayText(date: string): string {
    const items = this.tasks.findByDate(date);
    if (items.length === 0) throw notFound('이 날짜에는 할 일이 없습니다.');
    return formatDayText(date, items);
  }

  weekText(weekStart: string): string {
    const stats = this.stats.weekly({ weekStart });
    if (stats.totals.total === 0) throw notFound('이 주에는 기록된 할 일이 없습니다.');
    return formatWeekText(stats);
  }
}

export function formatDayText(date: string, items: Task[]): string {
  const done = items.filter((task) => task.status === 'done').length;
  const lines = [`📋 ${formatDateLabel(date)} 할 일 ${done}/${items.length} 완료`];
  for (const task of items) {
    let line = `${STATUS_MARK[task.status]} ${PRIORITY_MARK[task.priority]}${task.title}`;
    if (task.status === 'in_progress') line += ' (진행)';
    if (task.status === 'postponed' && task.postponedToDate) {
      line += ` → ${formatShort(task.postponedToDate)}`;
    }
    if ((task.status === 'postponed' || task.status === 'canceled') && task.statusReason) {
      line += ` (${task.statusReason})`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function formatWeekText(stats: WeeklyStats): string {
  const { totals, range } = stats;
  const lines = [
    `📊 주간 통계 ${range.start} ~ ${formatShort(range.end)}`,
    `완료율 ${stats.completionRate}% · 전체 ${totals.total}`,
    `완료 ${totals.done} · 진행 ${totals.in_progress} · 대기 ${totals.waiting} · 연기 ${totals.postponed} · 취소 ${totals.canceled}`,
  ];
  if (stats.postponeReasons.length > 0) {
    lines.push('', '연기 사유', ...stats.postponeReasons.map((r) => `- ${r.reason} ${r.count}건`));
  }
  if (stats.cancelReasons.length > 0) {
    lines.push('', '취소 사유', ...stats.cancelReasons.map((r) => `- ${r.reason} ${r.count}건`));
  }
  if (stats.repeatedlyPostponed.length > 0) {
    lines.push('', '2회 이상 연기', ...stats.repeatedlyPostponed.map((r) => `- ${r.title} (${r.count}회)`));
  }
  return lines.join('\n');
}
