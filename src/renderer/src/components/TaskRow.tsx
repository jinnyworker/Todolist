import { useState, type DragEvent } from 'react';

import { formatShort, today } from '@shared/dates';
import { PRIORITIES, STATUS_LABELS, TASK_STATUSES, type Priority, type Task, type TaskStatus } from '@shared/types';

import { PriorityChip, TagChip } from './Chips';

const UNRESOLVED: TaskStatus[] = ['waiting', 'in_progress'];

export interface TaskRowHandlers {
  onToggleDone: (task: Task) => void;
  onChangeStatus: (task: Task, status: TaskStatus) => void;
  onChangePriority: (task: Task, priority: Priority) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

interface TaskRowProps extends TaskRowHandlers {
  task: Task;
  draggable: boolean;
  dragOver: boolean;
  onDragStart: (task: Task) => void;
  onDragOver: (event: DragEvent, task: Task) => void;
  onDrop: (task: Task) => void;
  onDragEnd: () => void;
}

const nextPriority = (p: Priority): Priority => PRIORITIES[(PRIORITIES.indexOf(p) + 1) % PRIORITIES.length];

/** SCR-01 할 일 한 줄 */
export function TaskRow(props: TaskRowProps) {
  const { task } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = task.status === 'postponed';
  const checkable = task.status !== 'postponed' && task.status !== 'canceled';
  const overdue = task.dueDate !== null && task.dueDate < today() && UNRESOLVED.includes(task.status);

  const closeMenu = (): void => {
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <li
      className={`task-row task-row--${task.status}${props.dragOver ? ' task-row--drag-over' : ''}`}
      draggable={props.draggable}
      onDragStart={() => props.onDragStart(task)}
      onDragOver={(e) => props.onDragOver(e, task)}
      onDrop={() => props.onDrop(task)}
      onDragEnd={props.onDragEnd}
    >
      {props.draggable && (
        <span className="task-row__handle" aria-hidden title="드래그해서 순서 변경">
          ⋮⋮
        </span>
      )}
      <input
        type="checkbox"
        className="task-row__check"
        aria-label={`${task.title} 완료`}
        checked={task.status === 'done'}
        disabled={!checkable}
        onChange={() => props.onToggleDone(task)}
      />
      <PriorityChip
        priority={task.priority}
        onClick={locked ? undefined : () => props.onChangePriority(task, nextPriority(task.priority))}
      />
      <button type="button" className="task-row__title" onClick={() => props.onEdit(task)}>
        {task.title}
      </button>
      <div className="task-row__meta">
        {task.postponedFrom && (
          <span className="meta meta--postponed" title="연기되어 온 할 일">
            연기됨({formatShort(task.postponedFrom.taskDate)})
          </span>
        )}
        {task.recurrenceRuleId !== null && <span className="meta" title="반복 할 일">↻</span>}
        {task.dueDate && (
          <span className={`meta${overdue ? ' meta--overdue' : ''}`}>마감 {formatShort(task.dueDate)}</span>
        )}
        {task.remindAt && <span className="meta" title="알림">⏰</span>}
        {task.tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} />
        ))}
        {(task.status === 'postponed' || task.status === 'canceled') && task.statusReason && (
          <span className="meta meta--reason" title={task.statusReason}>
            {task.status === 'postponed' && task.postponedToDate ? `→ ${formatShort(task.postponedToDate)} · ` : ''}
            사유: {task.statusReason}
          </span>
        )}
      </div>
      <select
        className={`status-select chip--status-${task.status}`}
        aria-label="상태"
        value={task.status}
        disabled={locked}
        onChange={(e) => props.onChangeStatus(task, e.target.value as TaskStatus)}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <div className="menu">
        <button type="button" className="icon-button" aria-label="더 보기" onClick={() => setMenuOpen(!menuOpen)}>
          ⋯
        </button>
        {menuOpen && (
          <div className="menu__list" onMouseLeave={closeMenu}>
            <button type="button" onClick={() => (closeMenu(), props.onEdit(task))}>
              수정
            </button>
            {!locked && (
              <>
                <button type="button" onClick={() => (closeMenu(), props.onChangeStatus(task, 'postponed'))}>
                  연기
                </button>
                {task.status !== 'canceled' && (
                  <button type="button" onClick={() => (closeMenu(), props.onChangeStatus(task, 'canceled'))}>
                    취소
                  </button>
                )}
              </>
            )}
            {confirmDelete ? (
              <button type="button" className="menu__danger" onClick={() => (closeMenu(), props.onDelete(task))}>
                삭제 확인
              </button>
            ) : (
              <button type="button" className="menu__danger" onClick={() => setConfirmDelete(true)}>
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
