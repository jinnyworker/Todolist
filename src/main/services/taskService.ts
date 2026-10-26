import type { Database } from '../db/database';
import { BULK_MAX, TITLE_MAX, parseBulkText } from '../../shared/bulk';
import {
  type BulkCreateInput,
  type ChangeStatusInput,
  type ChangeStatusResult,
  type HistoryEntry,
  type HistoryInput,
  type HistoryResult,
  type Priority,
  type ReorderInput,
  type StatusCounts,
  type Tag,
  type Task,
  type TaskCreateInput,
  type TaskListInput,
  type TaskListResult,
  type TaskStatus,
  type TaskUpdateInput,
} from '../../shared/types';
import { conflict, invalid, notFound } from '../errors';
import {
  nowIso,
  optionalDate,
  optionalDateTime,
  optionalText,
  requireDate,
  requireId,
  requireIdList,
  requireObject,
  requirePriority,
  requireStatus,
  requireText,
} from './validate';

const MEMO_MAX = 2000;
const REASON_MAX = 200;
const TAGS_PER_TASK_MAX = 10;
const RECENT_REASONS_DEFAULT = 5;

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
const UNRESOLVED: TaskStatus[] = ['waiting', 'in_progress'];

interface TaskRow {
  id: number;
  title: string;
  memo: string | null;
  task_date: string;
  priority: Priority;
  sort_order: number;
  status: TaskStatus;
  status_reason: string | null;
  postponed_to_date: string | null;
  postponed_from_id: number | null;
  postponed_from_date: string | null;
  recurrence_rule_id: number | null;
  due_date: string | null;
  remind_at: string | null;
  completed_at: string | null;
}

const TASK_SELECT = `
  SELECT t.*, src.task_date AS postponed_from_date
  FROM task t LEFT JOIN task src ON src.id = t.postponed_from_id`;

export function emptyCounts(): StatusCounts {
  return { waiting: 0, in_progress: 0, done: 0, postponed: 0, canceled: 0 };
}

/** 미처리(대기·진행) 먼저 → 우선순위 → 사용자 순서 */
export function compareTasks(a: Task, b: Task): number {
  const unresolvedA = UNRESOLVED.includes(a.status) ? 0 : 1;
  const unresolvedB = UNRESOLVED.includes(b.status) ? 0 : 1;
  return (
    unresolvedA - unresolvedB ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.sortOrder - b.sortOrder ||
    a.id - b.id
  );
}

export class TaskService {
  constructor(private readonly db: Database) {}

  list(raw: unknown): TaskListResult {
    const input = requireObject(raw) as unknown as TaskListInput;
    const date = requireDate(input.date);
    const tagIds = requireIdList(input.tagIds, '태그', 100);
    const statuses = (input.statuses ?? []).map(requireStatus);

    const all = this.findByDate(date);
    const summary = { ...emptyCounts(), total: all.length };
    for (const task of all) summary[task.status]++;

    const items = all.filter(
      (task) =>
        (tagIds.length === 0 || task.tags.some((tag) => tagIds.includes(tag.id))) &&
        (statuses.length === 0 || statuses.includes(task.status)),
    );
    return { date, items, summary };
  }

  findByDate(date: string): Task[] {
    const rows = this.db.all<TaskRow>(`${TASK_SELECT} WHERE t.task_date = ?`, [date]);
    return this.attachTags(rows).sort(compareTasks);
  }

  getById(id: number): Task {
    const row = this.db.get<TaskRow>(`${TASK_SELECT} WHERE t.id = ?`, [id]);
    if (!row) throw notFound('할 일을 찾을 수 없습니다.');
    return this.attachTags([row])[0];
  }

  create(raw: unknown): Task {
    const input = requireObject(raw) as unknown as TaskCreateInput;
    const fields = this.validateFields(input, true);
    return this.db.transaction(() => {
      const id = this.insertTask({
        title: fields.title!,
        memo: fields.memo ?? null,
        taskDate: fields.taskDate!,
        priority: fields.priority ?? 'normal',
        dueDate: fields.dueDate ?? null,
        remindAt: fields.remindAt ?? null,
      });
      this.setTags(id, fields.tagIds ?? []);
      return this.getById(id);
    });
  }

  update(raw: unknown): Task {
    const input = requireObject(raw) as unknown as TaskUpdateInput;
    const id = requireId(input.id);
    const current = this.getById(id);
    const fields = this.validateFields(input, false, current.taskDate);

    if (current.status === 'postponed' && fields.taskDate && fields.taskDate !== current.taskDate) {
      throw conflict('연기된 할 일은 날짜를 바꿀 수 없습니다. 새 날짜의 할 일을 수정하세요.');
    }

    return this.db.transaction(() => {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      const assign = (column: string, value: string | number | null): void => {
        sets.push(`${column} = ?`);
        params.push(value);
      };
      if (fields.title !== undefined) assign('title', fields.title);
      if (fields.memo !== undefined) assign('memo', fields.memo);
      if (fields.dueDate !== undefined) assign('due_date', fields.dueDate);
      if (fields.remindAt !== undefined) assign('remind_at', fields.remindAt);
      if (fields.taskDate !== undefined) assign('task_date', fields.taskDate);
      if (fields.priority !== undefined) assign('priority', fields.priority);

      const nextDate = fields.taskDate ?? current.taskDate;
      const nextPriority = fields.priority ?? current.priority;
      if (nextDate !== current.taskDate || nextPriority !== current.priority) {
        // 날짜나 등급이 바뀌면 새 묶음의 맨 끝으로 보낸다.
        assign('sort_order', this.nextSortOrder(nextDate, nextPriority));
      }
      if (sets.length > 0) {
        assign('updated_at', nowIso());
        this.db.run(`UPDATE task SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      }
      if (fields.tagIds !== undefined) this.setTags(id, fields.tagIds);
      return this.getById(id);
    });
  }

  delete(raw: unknown): { id: number } {
    const id = requireId(requireObject(raw).id);
    const { changes } = this.db.run('DELETE FROM task WHERE id = ?', [id]);
    if (changes === 0) throw notFound('할 일을 찾을 수 없습니다.');
    return { id };
  }

  bulkCreate(raw: unknown): { items: Task[]; count: number } {
    const input = requireObject(raw) as unknown as BulkCreateInput;
    const taskDate = requireDate(input.taskDate);
    const priority = input.priority === undefined ? 'normal' : requirePriority(input.priority);
    if (typeof input.text !== 'string') throw invalid('등록할 내용을 입력하세요.');

    const titles = parseBulkText(input.text);
    if (titles.length === 0) throw invalid('등록할 할 일이 없습니다.');
    if (titles.length > BULK_MAX) throw invalid(`한 번에 ${BULK_MAX}건까지 등록할 수 있습니다.`);
    const tooLong = titles.findIndex((title) => title.length > TITLE_MAX);
    if (tooLong >= 0) throw invalid(`${tooLong + 1}번째 줄이 ${TITLE_MAX}자를 넘습니다.`);

    return this.db.transaction(() => {
      const ids = titles.map((title) =>
        this.insertTask({ title, memo: null, taskDate, priority, dueDate: null, remindAt: null }),
      );
      const items = ids.map((id) => this.getById(id));
      return { items, count: items.length };
    });
  }

  reorder(raw: unknown): { updated: number } {
    const input = requireObject(raw) as unknown as ReorderInput;
    const taskDate = requireDate(input.taskDate);
    const priority = requirePriority(input.priority);
    const ids = requireIdList(input.orderedIds, '순서 목록', 500);
    if (ids.length === 0) return { updated: 0 };

    const placeholders = ids.map(() => '?').join(',');
    const matched = this.db.all<{ id: number }>(
      `SELECT id FROM task WHERE id IN (${placeholders}) AND task_date = ? AND priority = ?`,
      [...ids, taskDate, priority],
    );
    if (matched.length !== ids.length) throw invalid('같은 날짜·같은 우선순위의 할 일만 순서를 바꿀 수 있습니다.');

    return this.db.transaction(() => {
      const updatedAt = nowIso();
      ids.forEach((id, index) => {
        this.db.run('UPDATE task SET sort_order = ?, updated_at = ? WHERE id = ?', [index, updatedAt, id]);
      });
      return { updated: ids.length };
    });
  }

  changeStatus(raw: unknown): ChangeStatusResult {
    const input = requireObject(raw) as unknown as ChangeStatusInput;
    const id = requireId(input.id);
    const task = this.getById(id);
    if (task.status === 'postponed') {
      throw conflict('연기된 할 일은 상태를 바꿀 수 없습니다. 새 날짜의 할 일에서 처리하세요.');
    }
    if (input.revert) return { task: this.revertDone(task), createdTask: null };

    const status = requireStatus(input.status);
    if (status === task.status) return { task, createdTask: null };

    return this.db.transaction(() => {
      const now = nowIso();
      if (status === 'postponed') return this.postpone(task, input, now);

      let reason: string | null = null;
      if (status === 'canceled') reason = requireText(input.reason, '사유', REASON_MAX);
      this.db.run(
        `UPDATE task SET status = ?, status_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [status, reason, status === 'done' ? now : null, now, id],
      );
      this.addHistory(id, task.status, status, reason, null, now);
      return { task: this.getById(id), createdTask: null };
    });
  }

  history(raw: unknown): HistoryResult {
    const input = requireObject(raw) as unknown as HistoryInput;
    const result: HistoryResult = { history: [], reasons: [] };
    if (input.id === undefined && input.recentReasons === undefined) {
      throw invalid('조회할 대상을 지정하세요.');
    }
    if (input.id !== undefined) {
      const chain = this.postponeChain(this.getById(requireId(input.id)).id);
      const placeholders = chain.map(() => '?').join(',');
      result.history = this.db
        .all<{
          task_id: number;
          task_date: string;
          from_status: TaskStatus | null;
          to_status: TaskStatus;
          reason: string | null;
          postpone_date: string | null;
          changed_at: string;
        }>(
          `SELECT h.*, t.task_date FROM task_status_history h JOIN task t ON t.id = h.task_id
           WHERE h.task_id IN (${placeholders}) ORDER BY h.changed_at, h.id`,
          chain,
        )
        .map(
          (row): HistoryEntry => ({
            taskId: row.task_id,
            taskDate: row.task_date,
            fromStatus: row.from_status,
            toStatus: row.to_status,
            reason: row.reason,
            postponeDate: row.postpone_date,
            changedAt: row.changed_at,
          }),
        );
    }
    if (input.recentReasons) {
      const status = input.recentReasons.status === 'canceled' ? 'canceled' : 'postponed';
      const limit = Math.min(Math.max(Number(input.recentReasons.limit) || RECENT_REASONS_DEFAULT, 1), 20);
      result.reasons = this.db
        .all<{ reason: string }>(
          `SELECT reason FROM task_status_history WHERE to_status = ? AND reason IS NOT NULL
           GROUP BY reason ORDER BY MAX(changed_at) DESC LIMIT ?`,
          [status, limit],
        )
        .map((row) => row.reason);
    }
    return result;
  }

  /** 이 할 일과 연기 원본들의 ID (오래된 것부터). */
  postponeChain(id: number): number[] {
    const chain: number[] = [];
    let current: number | null = id;
    while (current !== null && !chain.includes(current)) {
      chain.unshift(current);
      const row: { postponed_from_id: number | null } | undefined = this.db.get(
        'SELECT postponed_from_id FROM task WHERE id = ?',
        [current],
      );
      current = row?.postponed_from_id ?? null;
    }
    return chain;
  }

  /** 반복 규칙 생성 등 다른 서비스에서 쓰는 저수준 삽입. */
  insertTask(values: {
    title: string;
    memo: string | null;
    taskDate: string;
    priority: Priority;
    dueDate: string | null;
    remindAt: string | null;
    postponedFromId?: number | null;
    recurrenceRuleId?: number | null;
  }): number {
    const now = nowIso();
    const { lastId } = this.db.run(
      `INSERT INTO task (title, memo, task_date, priority, sort_order, status, due_date, remind_at,
         postponed_from_id, recurrence_rule_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?)`,
      [
        values.title,
        values.memo,
        values.taskDate,
        values.priority,
        this.nextSortOrder(values.taskDate, values.priority),
        values.dueDate,
        values.remindAt,
        values.postponedFromId ?? null,
        values.recurrenceRuleId ?? null,
        now,
        now,
      ],
    );
    this.addHistory(lastId, null, 'waiting', null, null, now);
    return lastId;
  }

  private postpone(task: Task, input: ChangeStatusInput, now: string): ChangeStatusResult {
    const reason = requireText(input.reason, '사유', REASON_MAX);
    const postponeDate = requireDate(input.postponeDate, '연기 날짜');
    if (postponeDate <= task.taskDate) throw invalid('연기 날짜는 원래 날짜보다 뒤여야 합니다.');

    this.db.run(
      `UPDATE task SET status = 'postponed', status_reason = ?, postponed_to_date = ?,
         completed_at = NULL, updated_at = ? WHERE id = ?`,
      [reason, postponeDate, now, task.id],
    );
    this.addHistory(task.id, task.status, 'postponed', reason, postponeDate, now);

    // 새 날짜의 할 일은 반복 규칙과 연결하지 않는다 (같은 규칙·날짜 중복 생성 방지).
    const newId = this.insertTask({
      title: task.title,
      memo: task.memo,
      taskDate: postponeDate,
      priority: task.priority,
      dueDate: task.dueDate,
      remindAt: null,
      postponedFromId: task.id,
    });
    this.setTags(
      newId,
      task.tags.map((tag) => tag.id),
    );
    return { task: this.getById(task.id), createdTask: this.getById(newId) };
  }

  private revertDone(task: Task): Task {
    if (task.status !== 'done') throw conflict('완료된 할 일만 완료를 해제할 수 있습니다.');
    const last = this.db.get<{ from_status: TaskStatus | null }>(
      `SELECT from_status FROM task_status_history WHERE task_id = ? AND to_status = 'done'
       ORDER BY changed_at DESC, id DESC LIMIT 1`,
      [task.id],
    );
    const previous: TaskStatus =
      last?.from_status && UNRESOLVED.includes(last.from_status) ? last.from_status : 'waiting';
    return this.db.transaction(() => {
      const now = nowIso();
      this.db.run(
        `UPDATE task SET status = ?, status_reason = NULL, completed_at = NULL, updated_at = ? WHERE id = ?`,
        [previous, now, task.id],
      );
      this.addHistory(task.id, 'done', previous, null, null, now);
      return this.getById(task.id);
    });
  }

  private validateFields(
    input: Partial<TaskCreateInput>,
    isCreate: boolean,
    currentDate?: string,
  ): Partial<TaskCreateInput> & { tagIds?: number[] } {
    const out: Partial<TaskCreateInput> & { tagIds?: number[] } = {};
    if (isCreate || input.title !== undefined) out.title = requireText(input.title, '제목', TITLE_MAX);
    if (isCreate || input.taskDate !== undefined) out.taskDate = requireDate(input.taskDate);
    if (input.priority !== undefined) out.priority = requirePriority(input.priority);
    if (input.memo !== undefined) out.memo = optionalText(input.memo, '메모', MEMO_MAX);
    if (input.dueDate !== undefined) out.dueDate = optionalDate(input.dueDate, '마감일');
    if (input.remindAt !== undefined) out.remindAt = optionalDateTime(input.remindAt, '알림 일시');
    if (input.tagIds !== undefined) {
      out.tagIds = requireIdList(input.tagIds, '태그', TAGS_PER_TASK_MAX);
      this.assertTagsExist(out.tagIds);
    }
    const baseDate = out.taskDate ?? currentDate;
    if (out.dueDate && baseDate && out.dueDate < baseDate) {
      throw invalid('마감일은 날짜보다 빠를 수 없습니다.');
    }
    return out;
  }

  private assertTagsExist(tagIds: number[]): void {
    if (tagIds.length === 0) return;
    const placeholders = tagIds.map(() => '?').join(',');
    const found = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM tag WHERE id IN (${placeholders})`, tagIds);
    if (Number(found?.n) !== tagIds.length) throw notFound('없는 태그가 포함되어 있습니다.');
  }

  private setTags(taskId: number, tagIds: number[]): void {
    this.db.run('DELETE FROM task_tag WHERE task_id = ?', [taskId]);
    const now = nowIso();
    for (const tagId of tagIds) {
      this.db.run('INSERT INTO task_tag (task_id, tag_id, created_at) VALUES (?, ?, ?)', [taskId, tagId, now]);
    }
  }

  private nextSortOrder(taskDate: string, priority: Priority): number {
    const row = this.db.get<{ max: number | null }>(
      'SELECT MAX(sort_order) AS max FROM task WHERE task_date = ? AND priority = ?',
      [taskDate, priority],
    );
    return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1;
  }

  private addHistory(
    taskId: number,
    from: TaskStatus | null,
    to: TaskStatus,
    reason: string | null,
    postponeDate: string | null,
    at: string,
  ): void {
    this.db.run(
      `INSERT INTO task_status_history (task_id, from_status, to_status, reason, postpone_date,
         changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, from, to, reason, postponeDate, at, at, at],
    );
  }

  private attachTags(rows: TaskRow[]): Task[] {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const tagRows = this.db.all<Tag & { task_id: number }>(
      `SELECT tt.task_id, g.id, g.name, g.color FROM task_tag tt JOIN tag g ON g.id = tt.tag_id
       WHERE tt.task_id IN (${placeholders}) ORDER BY g.name`,
      ids,
    );
    const tagsByTask = new Map<number, Tag[]>();
    for (const { task_id, ...tag } of tagRows) {
      tagsByTask.set(task_id, [...(tagsByTask.get(task_id) ?? []), tag]);
    }
    return rows.map((row) => toTask(row, tagsByTask.get(row.id) ?? []));
  }
}

function toTask(row: TaskRow, tags: Tag[]): Task {
  return {
    id: row.id,
    title: row.title,
    memo: row.memo,
    taskDate: row.task_date,
    priority: row.priority,
    sortOrder: row.sort_order,
    status: row.status,
    statusReason: row.status_reason,
    postponedToDate: row.postponed_to_date,
    postponedFrom:
      row.postponed_from_id !== null && row.postponed_from_date !== null
        ? { id: row.postponed_from_id, taskDate: row.postponed_from_date }
        : null,
    recurrenceRuleId: row.recurrence_rule_id,
    dueDate: row.due_date,
    remindAt: row.remind_at,
    completedAt: row.completed_at,
    tags,
  };
}
