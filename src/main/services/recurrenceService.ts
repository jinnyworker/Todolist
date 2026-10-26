import type { Database } from '../db/database';
import { addDays, isoWeekday, parseDate, daysInMonth, today } from '../../shared/dates';
import {
  RULE_TYPES,
  type Priority,
  type RecurrenceRule,
  type RecurrenceSaveInput,
  type RuleType,
} from '../../shared/types';
import { invalid, notFound } from '../errors';
import type { TaskService } from './taskService';
import {
  nowIso,
  optionalDate,
  optionalText,
  requireDate,
  requireId,
  requireObject,
  requirePriority,
  requireText,
} from './validate';

/** 오래 앱을 안 켰을 때 한 번에 만드는 최대 일수. 그 이전 날짜는 건너뛴다. */
const MAX_CATCH_UP_DAYS = 366;
const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];

interface RuleRow {
  id: number;
  title: string;
  memo: string | null;
  priority: Priority;
  rule_type: RuleType;
  weekdays: string | null;
  month_day: number | null;
  start_date: string;
  end_date: string | null;
  is_active: number;
  last_generated_date: string | null;
}

/** 해당 날짜가 반복 규칙에 맞는지. 매월 규칙에서 그달에 없는 일자는 말일로 맞춘다. */
export function ruleMatches(rule: Pick<RecurrenceRule, 'ruleType' | 'weekdays' | 'monthDay'>, date: string): boolean {
  switch (rule.ruleType) {
    case 'daily':
      return true;
    case 'weekdays':
      return WEEKDAYS_ONLY.includes(isoWeekday(date));
    case 'weekly':
      return rule.weekdays.includes(isoWeekday(date));
    case 'monthly': {
      const d = parseDate(date);
      const lastDay = daysInMonth(d.getFullYear(), d.getMonth() + 1);
      return d.getDate() === Math.min(rule.monthDay ?? 1, lastDay);
    }
  }
}

export class RecurrenceService {
  constructor(
    private readonly db: Database,
    private readonly tasks: TaskService,
  ) {}

  list(): { items: RecurrenceRule[] } {
    const rows = this.db.all<RuleRow>('SELECT * FROM recurrence_rule ORDER BY is_active DESC, title');
    return { items: rows.map(toRule) };
  }

  save(raw: unknown): RecurrenceRule & { generatedCount: number } {
    const input = requireObject(raw) as unknown as RecurrenceSaveInput;
    const title = requireText(input.title, '제목', 200);
    const memo = optionalText(input.memo, '메모', 2000);
    const priority = input.priority === undefined ? 'normal' : requirePriority(input.priority);
    if (!RULE_TYPES.includes(input.ruleType)) throw invalid('반복 유형이 올바르지 않습니다.');
    const startDate = requireDate(input.startDate, '시작일');
    const endDate = optionalDate(input.endDate, '종료일');
    if (endDate && endDate < startDate) throw invalid('종료일은 시작일보다 빠를 수 없습니다.');

    let weekdays: number[] = [];
    let monthDay: number | null = null;
    if (input.ruleType === 'weekly') {
      weekdays = [...new Set(input.weekdays ?? [])].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
      if (weekdays.length === 0) throw invalid('반복할 요일을 선택하세요.');
    }
    if (input.ruleType === 'monthly') {
      monthDay = Number(input.monthDay);
      if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) throw invalid('반복할 일자를 선택하세요.');
    }
    const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

    return this.db.transaction(() => {
      const now = nowIso();
      const values = [title, memo, priority, input.ruleType, weekdays.join(',') || null, monthDay, startDate, endDate];
      let id: number;
      if (input.id === undefined) {
        id = this.db.run(
          `INSERT INTO recurrence_rule (title, memo, priority, rule_type, weekdays, month_day, start_date, end_date,
             is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...values, isActive ? 1 : 0, now, now],
        ).lastId;
      } else {
        id = requireId(input.id);
        // 수정한 규칙은 오늘(또는 미래 시작일)부터 적용한다. 지난 날짜는 다시 만들지 않아,
        // 사용자가 지운 과거 할 일이 되살아나지 않게 한다.
        const resumeAfter = addDays(startDate > today() ? startDate : today(), -1);
        const { changes } = this.db.run(
          `UPDATE recurrence_rule SET title = ?, memo = ?, priority = ?, rule_type = ?, weekdays = ?, month_day = ?,
             start_date = ?, end_date = ?, is_active = ?, last_generated_date = ?, updated_at = ? WHERE id = ?`,
          [...values, isActive ? 1 : 0, resumeAfter, now, id],
        );
        if (changes === 0) throw notFound('반복 규칙을 찾을 수 없습니다.');
      }
      const rule = this.getRow(id);
      // 시작일이 미래면 시작일 당일분까지 미리 만들어 둔다.
      const until = startDate > today() ? startDate : today();
      return { ...toRule(rule), generatedCount: isActive ? this.generateFor(rule, until) : 0 };
    });
  }

  delete(raw: unknown): { id: number } {
    const id = requireId(requireObject(raw).id);
    return this.db.transaction(() => {
      this.db.run('UPDATE task SET recurrence_rule_id = NULL WHERE recurrence_rule_id = ?', [id]);
      const { changes } = this.db.run('DELETE FROM recurrence_rule WHERE id = ?', [id]);
      if (changes === 0) throw notFound('반복 규칙을 찾을 수 없습니다.');
      return { id };
    });
  }

  /** 앱 실행·날짜 변경 시 활성 규칙의 할 일을 오늘까지 만든다. */
  generateDue(until: string = today()): number {
    const rules = this.db.all<RuleRow>('SELECT * FROM recurrence_rule WHERE is_active = 1');
    return this.db.transaction(() => rules.reduce((sum, rule) => sum + this.generateFor(rule, until), 0));
  }

  private generateFor(row: RuleRow, until: string): number {
    const rule = toRule(row);
    const end = rule.endDate && rule.endDate < until ? rule.endDate : until;
    let date = row.last_generated_date ? addDays(row.last_generated_date, 1) : rule.startDate;
    if (date < rule.startDate) date = rule.startDate;
    const earliest = addDays(end, -MAX_CATCH_UP_DAYS);
    if (date < earliest) date = earliest;

    let created = 0;
    for (; date <= end; date = addDays(date, 1)) {
      if (!ruleMatches(rule, date)) continue;
      const exists = this.db.get('SELECT 1 FROM task WHERE recurrence_rule_id = ? AND task_date = ?', [rule.id, date]);
      if (exists) continue;
      this.tasks.insertTask({
        title: rule.title,
        memo: rule.memo,
        taskDate: date,
        priority: rule.priority,
        dueDate: null,
        remindAt: null,
        recurrenceRuleId: rule.id,
      });
      created++;
    }
    if (end >= (row.last_generated_date ?? '')) {
      this.db.run('UPDATE recurrence_rule SET last_generated_date = ? WHERE id = ?', [end, rule.id]);
    }
    return created;
  }

  private getRow(id: number): RuleRow {
    const row = this.db.get<RuleRow>('SELECT * FROM recurrence_rule WHERE id = ?', [id]);
    if (!row) throw notFound('반복 규칙을 찾을 수 없습니다.');
    return row;
  }
}

function toRule(row: RuleRow): RecurrenceRule {
  return {
    id: row.id,
    title: row.title,
    memo: row.memo,
    priority: row.priority,
    ruleType: row.rule_type,
    weekdays: row.weekdays ? row.weekdays.split(',').map(Number) : [],
    monthDay: row.month_day,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active === 1,
  };
}
