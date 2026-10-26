import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '../src/main/db/database';
import { AppError, toResult } from '../src/main/errors';
import { createServices, type Services } from '../src/main/services';
import { ruleMatches } from '../src/main/services/recurrenceService';
import { formatDayText } from '../src/main/services/shareService';
import { parseBulkText } from '../src/shared/bulk';
import { addDays, today } from '../src/shared/dates';

const D = '2026-10-26'; // 월요일

let s: Services;

beforeEach(async () => {
  s = createServices(await Database.open(null));
});

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('할 일 CRUD (REQ-1~3)', () => {
  it('등록하면 대기 상태와 생성 이력이 남는다', () => {
    const task = s.tasks.create({ title: '  메일 회신 ', taskDate: D, priority: 'high' });
    expect(task).toMatchObject({ title: '메일 회신', status: 'waiting', priority: 'high', sortOrder: 0 });
    const { history } = s.tasks.history({ id: task.id });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'waiting' });
  });

  it('입력 검증: 제목 누락, 마감일이 날짜보다 빠름, 없는 태그', () => {
    expectError(() => s.tasks.create({ title: '  ', taskDate: D }), 'INVALID_INPUT');
    expectError(() => s.tasks.create({ title: 'a', taskDate: '2026-02-30' }), 'INVALID_INPUT');
    expectError(() => s.tasks.create({ title: 'a', taskDate: D, dueDate: '2026-10-25' }), 'INVALID_INPUT');
    expectError(() => s.tasks.create({ title: 'a', taskDate: D, tagIds: [99] }), 'NOT_FOUND');
  });

  it('수정: 등급을 바꾸면 새 등급의 맨 끝으로 간다', () => {
    s.tasks.create({ title: 'A', taskDate: D, priority: 'high' });
    const b = s.tasks.create({ title: 'B', taskDate: D, priority: 'normal' });
    const updated = s.tasks.update({ id: b.id, priority: 'high', memo: '메모' });
    expect(updated).toMatchObject({ priority: 'high', sortOrder: 1, memo: '메모' });
  });

  it('삭제하면 목록과 이력에서 사라진다', () => {
    const task = s.tasks.create({ title: 'A', taskDate: D });
    s.tasks.delete({ id: task.id });
    expect(s.tasks.list({ date: D }).items).toHaveLength(0);
    expect(s.db.all('SELECT * FROM task_status_history')).toHaveLength(0);
    expectError(() => s.tasks.delete({ id: task.id }), 'NOT_FOUND');
  });
});

describe('아침 일괄 등록 (REQ-4)', () => {
  it('목록 기호와 빈 줄을 지우고 한 줄당 한 건', () => {
    expect(parseBulkText('- 제안서\n* 메일\n\n1. 운동\n  2) 정리  \r\n   ')).toEqual(['제안서', '메일', '운동', '정리']);
  });

  it('입력 순서대로 기존 목록 뒤에 추가된다', () => {
    s.tasks.create({ title: '기존', taskDate: D });
    const { count, items } = s.tasks.bulkCreate({ taskDate: D, text: '- 하나\n- 둘\n- 셋' });
    expect(count).toBe(3);
    expect(items.map((t) => t.sortOrder)).toEqual([1, 2, 3]);
    expect(s.tasks.list({ date: D }).items.map((t) => t.title)).toEqual(['기존', '하나', '둘', '셋']);
  });

  it('0건, 50건 초과, 200자 초과 줄은 거부한다 (전체 취소)', () => {
    expectError(() => s.tasks.bulkCreate({ taskDate: D, text: '\n - \n' }), 'INVALID_INPUT');
    const many = Array.from({ length: 51 }, (_, i) => `할 일 ${i}`).join('\n');
    expectError(() => s.tasks.bulkCreate({ taskDate: D, text: many }), 'INVALID_INPUT');
    expectError(() => s.tasks.bulkCreate({ taskDate: D, text: `정상\n${'가'.repeat(201)}` }), 'INVALID_INPUT');
    expect(s.tasks.list({ date: D }).items).toHaveLength(0);
  });
});

describe('우선순위·정렬 (REQ-5, REQ-10)', () => {
  it('미처리 먼저 → 등급 → 순서', () => {
    const low = s.tasks.create({ title: 'low', taskDate: D, priority: 'low' });
    s.tasks.create({ title: 'high1', taskDate: D, priority: 'high' });
    const high2 = s.tasks.create({ title: 'high2', taskDate: D, priority: 'high' });
    s.tasks.changeStatus({ id: high2.id, status: 'done' });
    s.tasks.create({ title: 'normal', taskDate: D });
    expect(s.tasks.list({ date: D }).items.map((t) => t.title)).toEqual(['high1', 'normal', 'low', 'high2']);
    expect(low.sortOrder).toBe(0);
  });

  it('같은 날짜·등급 안에서만 순서를 바꾼다', () => {
    const a = s.tasks.create({ title: 'A', taskDate: D, priority: 'high' });
    const b = s.tasks.create({ title: 'B', taskDate: D, priority: 'high' });
    const c = s.tasks.create({ title: 'C', taskDate: D, priority: 'normal' });
    s.tasks.reorder({ taskDate: D, priority: 'high', orderedIds: [b.id, a.id] });
    expect(s.tasks.list({ date: D }).items.map((t) => t.title)).toEqual(['B', 'A', 'C']);
    expectError(() => s.tasks.reorder({ taskDate: D, priority: 'high', orderedIds: [a.id, c.id] }), 'INVALID_INPUT');
  });
});

describe('상태 변경 (REQ-6~9)', () => {
  it('완료 체크와 해제: 직전 상태로 되돌린다', () => {
    const task = s.tasks.create({ title: 'A', taskDate: D });
    s.tasks.changeStatus({ id: task.id, status: 'in_progress' });
    const done = s.tasks.changeStatus({ id: task.id, status: 'done' }).task;
    expect(done.completedAt).not.toBeNull();
    const reverted = s.tasks.changeStatus({ id: task.id, revert: true }).task;
    expect(reverted).toMatchObject({ status: 'in_progress', completedAt: null });
    expectError(() => s.tasks.changeStatus({ id: task.id, revert: true }), 'CONFLICT');
  });

  it('취소는 사유가 필수다', () => {
    const task = s.tasks.create({ title: 'A', taskDate: D });
    expectError(() => s.tasks.changeStatus({ id: task.id, status: 'canceled' }), 'INVALID_INPUT');
    const canceled = s.tasks.changeStatus({ id: task.id, status: 'canceled', reason: '필요 없어짐' }).task;
    expect(canceled).toMatchObject({ status: 'canceled', statusReason: '필요 없어짐' });
  });

  it('연기: 원본은 연기로 남고 새 날짜에 태그까지 복사된 할 일이 생긴다', () => {
    const tag = s.tags.save({ name: '업무' });
    const task = s.tasks.create({ title: '은행 업무', taskDate: D, priority: 'high', tagIds: [tag.id] });
    expectError(() => s.tasks.changeStatus({ id: task.id, status: 'postponed', reason: 'x' }), 'INVALID_INPUT');
    expectError(
      () => s.tasks.changeStatus({ id: task.id, status: 'postponed', reason: 'x', postponeDate: D }),
      'INVALID_INPUT',
    );

    const { task: original, createdTask } = s.tasks.changeStatus({
      id: task.id,
      status: 'postponed',
      reason: '서류 미비',
      postponeDate: '2026-10-28',
    });
    expect(original).toMatchObject({ status: 'postponed', statusReason: '서류 미비', postponedToDate: '2026-10-28' });
    expect(createdTask).toMatchObject({
      taskDate: '2026-10-28',
      status: 'waiting',
      priority: 'high',
      postponedFrom: { id: task.id, taskDate: D },
      tags: [{ id: tag.id, name: '업무' }],
    });

    // 연기된 원본은 더 이상 상태·날짜를 바꿀 수 없다.
    expectError(() => s.tasks.changeStatus({ id: task.id, status: 'done' }), 'CONFLICT');
    expectError(() => s.tasks.update({ id: task.id, taskDate: '2026-10-29' }), 'CONFLICT');

    // 새 할 일의 이력에는 원본 이력까지 이어서 보인다.
    const { history } = s.tasks.history({ id: createdTask!.id });
    expect(history.map((h) => h.toStatus)).toEqual(['waiting', 'postponed', 'waiting']);

    const { reasons } = s.tasks.history({ recentReasons: { status: 'postponed' } });
    expect(reasons).toEqual(['서류 미비']);
  });

  it('지난 날짜의 대기 항목은 자동 이월하지 않는다', () => {
    s.tasks.create({ title: '어제 일', taskDate: addDays(today(), -1) });
    expect(s.tasks.list({ date: today() }).items).toHaveLength(0);
    expect(s.tasks.list({ date: addDays(today(), -1) }).items[0].status).toBe('waiting');
  });
});

describe('달력·주간 통계 (REQ-11, REQ-12)', () => {
  it('날짜별 요약과 주간 집계, 완료율 = 완료 / (전체 − 취소)', () => {
    const ids = s.tasks.bulkCreate({ taskDate: D, text: 'a\nb\nc\nd\ne' }).items.map((t) => t.id);
    s.tasks.changeStatus({ id: ids[0], status: 'done' });
    s.tasks.changeStatus({ id: ids[1], status: 'done' });
    s.tasks.changeStatus({ id: ids[2], status: 'canceled', reason: '중복' });
    s.tasks.changeStatus({ id: ids[3], status: 'postponed', reason: '시간 부족', postponeDate: '2026-10-27' });

    const month = s.stats.monthSummary({ month: '2026-10' });
    expect(month.days).toEqual([
      { date: '2026-10-26', total: 5, waiting: 1, in_progress: 0, done: 2, postponed: 1, canceled: 1 },
      { date: '2026-10-27', total: 1, waiting: 1, in_progress: 0, done: 0, postponed: 0, canceled: 0 },
    ]);

    const week = s.stats.weekly({ weekStart: D });
    expect(week.range).toEqual({ start: D, end: '2026-11-01' });
    expect(week.totals).toMatchObject({ total: 6, done: 2, canceled: 1, postponed: 1, waiting: 2 });
    expect(week.completionRate).toBe(40); // 2 / (6 - 1)
    expect(week.byDay).toHaveLength(7);
    expect(week.byDay[1]).toMatchObject({ date: '2026-10-27', waiting: 1 });
    expect(week.postponeReasons).toEqual([{ reason: '시간 부족', count: 1 }]);
    expect(week.cancelReasons).toEqual([{ reason: '중복', count: 1 }]);
  });

  it('2회 이상 연기된 할 일을 찾는다', () => {
    const first = s.tasks.create({ title: '은행 업무', taskDate: D });
    const second = s.tasks.changeStatus({ id: first.id, status: 'postponed', reason: 'a', postponeDate: '2026-10-27' })
      .createdTask!;
    const third = s.tasks.changeStatus({ id: second.id, status: 'postponed', reason: 'b', postponeDate: '2026-10-29' })
      .createdTask!;
    expect(s.stats.weekly({ weekStart: D }).repeatedlyPostponed).toEqual([
      { title: '은행 업무', count: 2, latestTaskId: third.id },
    ]);
  });

  it('잘못된 월·날짜 형식은 거부한다', () => {
    expectError(() => s.stats.monthSummary({ month: '2026-13' }), 'INVALID_INPUT');
    expectError(() => s.stats.weekly({ weekStart: 'x' }), 'INVALID_INPUT');
  });
});

describe('태그 (REQ-15)', () => {
  it('중복 이름 거부, 태그 필터, 삭제 시 할 일에서 떼어냄', () => {
    const work = s.tags.save({ name: '업무', color: '#2563EB' });
    expectError(() => s.tags.save({ name: '업무' }), 'CONFLICT');
    expectError(() => s.tags.save({ name: '색', color: 'blue' }), 'INVALID_INPUT');
    s.tasks.create({ title: 'A', taskDate: D, tagIds: [work.id] });
    s.tasks.create({ title: 'B', taskDate: D });
    expect(s.tasks.list({ date: D, tagIds: [work.id] }).items.map((t) => t.title)).toEqual(['A']);
    expect(s.tags.list().items[0].taskCount).toBe(1);
    s.tags.delete({ id: work.id });
    expect(s.tasks.list({ date: D }).items.every((t) => t.tags.length === 0)).toBe(true);
  });
});

describe('반복 (REQ-14)', () => {
  it('규칙 일치 판단: 평일·요일·매월 말일 보정', () => {
    expect(ruleMatches({ ruleType: 'weekdays', weekdays: [], monthDay: null }, '2026-10-31')).toBe(false); // 토
    expect(ruleMatches({ ruleType: 'weekly', weekdays: [1, 3], monthDay: null }, '2026-10-28')).toBe(true); // 수
    expect(ruleMatches({ ruleType: 'monthly', weekdays: [], monthDay: 31 }, '2026-11-30')).toBe(true);
    expect(ruleMatches({ ruleType: 'monthly', weekdays: [], monthDay: 31 }, '2026-11-29')).toBe(false);
  });

  it('저장하면 오늘까지 만들고, 다시 돌려도 중복 생성하지 않는다', () => {
    const start = addDays(today(), -2);
    const rule = s.recurrence.save({ title: '운동', ruleType: 'daily', startDate: start });
    expect(rule.generatedCount).toBe(3);
    expect(s.recurrence.generateDue()).toBe(0);
    expect(s.recurrence.generateDue(addDays(today(), 1))).toBe(1);
    expect(s.tasks.list({ date: today() }).items[0]).toMatchObject({ title: '운동', recurrenceRuleId: rule.id });
  });

  it('수정해도 지운 과거 할 일은 되살아나지 않고, 삭제하면 만든 할 일은 남는다', () => {
    const rule = s.recurrence.save({ title: '운동', ruleType: 'daily', startDate: addDays(today(), -1) });
    const yesterday = s.tasks.list({ date: addDays(today(), -1) }).items[0];
    s.tasks.delete({ id: yesterday.id });
    s.recurrence.save({ id: rule.id, title: '운동 40분', ruleType: 'daily', startDate: addDays(today(), -1) });
    expect(s.tasks.list({ date: addDays(today(), -1) }).items).toHaveLength(0);

    s.recurrence.delete({ id: rule.id });
    expect(s.tasks.list({ date: today() }).items[0].recurrenceRuleId).toBeNull();
  });

  it('유형별 필수값 검증', () => {
    expectError(() => s.recurrence.save({ title: 'a', ruleType: 'weekly', startDate: D }), 'INVALID_INPUT');
    expectError(() => s.recurrence.save({ title: 'a', ruleType: 'monthly', startDate: D }), 'INVALID_INPUT');
  });
});

describe('설정 (REQ-16)', () => {
  it('기본값, 변경, 잘못된 값 거부', () => {
    expect(s.settings.get()).toEqual({ morningReminderEnabled: false, morningReminderTime: '08:30', taskReminderEnabled: true });
    expect(s.settings.update({ morningReminderEnabled: true, morningReminderTime: '07:45' })).toMatchObject({
      morningReminderEnabled: true,
      morningReminderTime: '07:45',
    });
    expectError(() => s.settings.update({ morningReminderTime: '25:00' }), 'INVALID_INPUT');
    expectError(() => s.settings.update({ unknown: 1 }), 'INVALID_INPUT');
  });
});

describe('공유 텍스트 (REQ-17)', () => {
  it('하루 목록을 상태 기호와 사유로 만든다', () => {
    const ids = s.tasks.bulkCreate({ taskDate: D, text: '주간 회의\n제안서 초안\n은행 업무' }).items.map((t) => t.id);
    s.tasks.changeStatus({ id: ids[0], status: 'done' });
    s.tasks.update({ id: ids[1], priority: 'high' });
    s.tasks.changeStatus({ id: ids[1], status: 'in_progress' });
    s.tasks.changeStatus({ id: ids[2], status: 'postponed', reason: '서류 미비', postponeDate: '2026-10-28' });
    expect(formatDayText(D, s.tasks.findByDate(D))).toBe(
      ['📋 2026-10-26 (월) 할 일 1/3 완료', '☐ ▲ 제안서 초안 (진행)', '☑ 주간 회의', '⤳ 은행 업무 → 10/28 (서류 미비)'].join('\n'),
    );
    expectError(() => s.share.dayText('2026-01-01'), 'NOT_FOUND');
    // 10/28에 생긴 연기 복사본도 같은 주라 전체 4건 중 완료 1건.
    expect(s.share.weekText(D)).toContain('완료율 25% · 전체 4');
  });
});

describe('저장·오류 응답 (REQ-18)', () => {
  it('파일 DB에 저장하고 다시 열면 데이터가 남아 있다', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'todolist-')), 'todolist.db');
    const first = createServices(await Database.open(file));
    first.tasks.create({ title: '저장 확인', taskDate: D });
    first.db.close();
    const second = createServices(await Database.open(file));
    expect(second.tasks.list({ date: D }).items[0].title).toBe('저장 확인');
  });

  it('도메인 오류는 코드로, 내부 오류는 일반 메시지로 바꾼다', () => {
    const notFoundResult = toResult(() => s.tasks.getById(999));
    expect(notFoundResult).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    const internal = toResult(() => {
      throw new Error('secret detail');
    });
    expect(internal).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' } });
  });
});
