import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { addDays, formatDateLabel, today } from '@shared/dates';
import { STATUS_LABELS, TASK_STATUSES, type Priority, type Task, type TaskStatus } from '@shared/types';

import { ReasonModal } from '../components/ReasonModal';
import { ShareModal } from '../components/ShareModal';
import { TaskModal } from '../components/TaskModal';
import { TaskRow, type TaskRowHandlers } from '../components/TaskRow';
import { useToast } from '../components/Toast';
import { navigate, routes } from '../hooks/useHashRoute';
import { useLoad } from '../hooks/useLoad';
import { api, call, errorMessage } from '../utils/api';

const UNDO_MS = 5000;
const UNRESOLVED: TaskStatus[] = ['waiting', 'in_progress'];

interface DayPageProps {
  date: string;
  onOpenBulk: () => void;
  modalOpen: boolean;
}

/** SCR-01 오늘 할 일 (날짜별 목록) */
export function DayPage({ date, onOpenBulk, modalOpen }: DayPageProps) {
  const toast = useToast();
  const [tagFilter, setTagFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [reason, setReason] = useState<{ task: Task; mode: 'postponed' | 'canceled' } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [showProcessed, setShowProcessed] = useState(true);
  const [pendingDeletes, setPendingDeletes] = useState<number[]>([]);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const deleteTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const { data, error, showSkeleton, reload } = useLoad(
    () =>
      api.task.list({
        date,
        tagIds: tagFilter === '' ? undefined : [tagFilter],
        statuses: statusFilter ? [statusFilter] : undefined,
      }),
    [date, tagFilter, statusFilter],
  );
  const { data: tagData } = useLoad(() => api.tag.list(), []);

  const items = (data?.items ?? []).filter((t) => !pendingDeletes.includes(t.id));
  const active = items.filter((t) => UNRESOLVED.includes(t.status));
  const processed = items.filter((t) => !UNRESOLVED.includes(t.status));
  const filtered = tagFilter !== '' || statusFilter !== null;
  const anyModal = modalOpen || editing !== null || reason !== null || sharing;

  // 삭제는 5초 동안 되돌릴 수 있게 미뤘다가 실제로 지운다. 화면을 떠나면 바로 지운다.
  const commitDelete = useCallback((id: number) => {
    deleteTimers.current.delete(id);
    call(api.task.delete(id))
      .catch(() => undefined)
      .finally(() => setPendingDeletes((ids) => ids.filter((x) => x !== id)));
  }, []);

  useEffect(() => {
    const timers = deleteTimers.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        void call(api.task.delete(id)).catch(() => undefined);
      }
      timers.clear();
    };
  }, []);

  const run = (promise: Promise<unknown>): void => {
    promise.catch((err) => toast(errorMessage(err), { tone: 'error' }));
  };

  const handlers: TaskRowHandlers = {
    onToggleDone: (task) =>
      run(call(api.task.changeStatus(task.status === 'done' ? { id: task.id, revert: true } : { id: task.id, status: 'done' }))),
    onChangeStatus: (task, status) => {
      if (status === 'postponed' || status === 'canceled') setReason({ task, mode: status });
      else run(call(api.task.changeStatus({ id: task.id, status })));
    },
    onChangePriority: (task, priority: Priority) => run(call(api.task.update({ id: task.id, priority }))),
    onEdit: (task) => setEditing(task),
    onDelete: (task) => {
      setEditing(null);
      setPendingDeletes((ids) => [...ids, task.id]);
      deleteTimers.current.set(task.id, setTimeout(() => commitDelete(task.id), UNDO_MS));
      toast('삭제되었습니다.', {
        durationMs: UNDO_MS,
        action: {
          label: '되돌리기',
          onClick: () => {
            clearTimeout(deleteTimers.current.get(task.id));
            deleteTimers.current.delete(task.id);
            setPendingDeletes((ids) => ids.filter((x) => x !== task.id));
          },
        },
      });
    },
  };

  // 드래그는 같은 등급의 미처리 할 일 사이에서만, 필터가 꺼져 있을 때만 허용한다.
  const canDropOn = (target: Task): boolean =>
    dragging !== null && dragging.id !== target.id && dragging.priority === target.priority && UNRESOLVED.includes(target.status);

  const onDragOver = (event: DragEvent, target: Task): void => {
    if (!canDropOn(target)) return;
    event.preventDefault();
    setDragOverId(target.id);
  };

  const onDrop = (target: Task): void => {
    if (!dragging || !canDropOn(target)) return;
    const group = active.filter((t) => t.priority === target.priority).map((t) => t.id);
    const ids = group.filter((id) => id !== dragging.id);
    ids.splice(ids.indexOf(target.id) + (group.indexOf(dragging.id) < group.indexOf(target.id) ? 1 : 0), 0, dragging.id);
    // 같은 등급의 처리된 할 일은 뒤에 붙여 순서를 유지한다.
    const rest = processed.filter((t) => t.priority === target.priority).map((t) => t.id);
    run(call(api.task.reorder({ taskDate: date, priority: target.priority, orderedIds: [...ids, ...rest] })));
    setDragging(null);
    setDragOverId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (anyModal) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'n') onOpenBulk();
      else if (event.ctrlKey && event.key.toLowerCase() === 'n') setEditing('new');
      else if (event.key === 'ArrowLeft') navigate(routes.day(addDays(date, -1)));
      else if (event.key === 'ArrowRight') navigate(routes.day(addDays(date, 1)));
      else if (event.key.toLowerCase() === 't' && !event.ctrlKey) navigate(routes.day(today()));
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyModal, date, onOpenBulk]);

  const rowProps = (task: Task) => ({
    task,
    ...handlers,
    draggable: !filtered && UNRESOLVED.includes(task.status),
    dragOver: dragOverId === task.id,
    onDragStart: setDragging,
    onDragOver,
    onDrop,
    onDragEnd: () => {
      setDragging(null);
      setDragOverId(null);
    },
  });

  const summary = data?.summary;

  return (
    <section className="page day-page">
      <header className="page__header">
        <div className="date-nav">
          <button type="button" className="icon-button" aria-label="이전 날" onClick={() => navigate(routes.day(addDays(date, -1)))}>
            ◀
          </button>
          <label className="date-nav__label">
            <span>{formatDateLabel(date)}</span>
            <input
              type="date"
              className="date-nav__picker"
              aria-label="날짜 선택"
              value={date}
              onChange={(e) => e.target.value && navigate(routes.day(e.target.value))}
            />
          </label>
          <button type="button" className="icon-button" aria-label="다음 날" onClick={() => navigate(routes.day(addDays(date, 1)))}>
            ▶
          </button>
          {date !== today() && (
            <button type="button" className="button button--small" onClick={() => navigate(routes.day(today()))}>
              오늘
            </button>
          )}
        </div>
        <div className="page__actions">
          <button type="button" className="button" disabled={!summary?.total} onClick={() => setSharing(true)}>
            공유
          </button>
          <button type="button" className="button" onClick={onOpenBulk}>
            아침 일괄 등록
          </button>
          <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
            + 추가
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="status-summary">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`status-summary__item chip--status-${s}${statusFilter === s ? ' status-summary__item--active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {STATUS_LABELS[s]} {summary?.[s] ?? 0}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="form__inline">
          태그
          <select
            className="input input--small"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">전체</option>
            {tagData?.items.map((tag) => (
              <option key={tag.id} value={tag.id}>
                #{tag.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="day-page__capture" id="day-capture">
        {error ? (
          <div className="empty">
            <p>목록을 불러오지 못했습니다.</p>
            <button type="button" className="button" onClick={reload}>
              다시 시도
            </button>
          </div>
        ) : data === null ? (
          showSkeleton && <div className="skeleton-list"><div /><div /><div /></div>
        ) : items.length === 0 ? (
          <div className="empty">
            <p>{filtered ? '조건에 맞는 할 일이 없습니다.' : '이 날짜에 할 일이 없습니다.'}</p>
            {!filtered && (
              <div className="form__inline">
                <button type="button" className="button" onClick={onOpenBulk}>
                  아침 일괄 등록
                </button>
                <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
                  + 추가
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h3 className="list-title">할 일 {active.length}</h3>
            <ul className="task-list">
              {active.map((task) => (
                <TaskRow key={task.id} {...rowProps(task)} />
              ))}
            </ul>
            {processed.length > 0 && (
              <>
                <button type="button" className="list-title list-title--toggle" onClick={() => setShowProcessed(!showProcessed)}>
                  {showProcessed ? '▾' : '▸'} 처리됨 {processed.length}
                </button>
                {showProcessed && (
                  <ul className="task-list task-list--processed">
                    {processed.map((task) => (
                      <TaskRow key={task.id} {...rowProps(task)} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>

      {editing !== null && (
        <TaskModal
          task={editing === 'new' ? null : editing}
          defaultDate={date}
          onClose={() => setEditing(null)}
          onDelete={handlers.onDelete}
        />
      )}
      {reason && <ReasonModal task={reason.task} mode={reason.mode} onClose={() => setReason(null)} />}
      {sharing && (
        <ShareModal
          title={`${formatDateLabel(date)} 할 일`}
          scope={{ scope: 'day', date }}
          captureSelector="#day-capture"
          onClose={() => setSharing(false)}
        />
      )}
    </section>
  );
}
