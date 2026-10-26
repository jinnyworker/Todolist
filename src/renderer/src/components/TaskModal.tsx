import { useEffect, useState, type FormEvent } from 'react';

import { formatShort } from '@shared/dates';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type HistoryEntry,
  type Priority,
  type RuleType,
  type Tag,
  type Task,
} from '@shared/types';

import { api, call, errorMessage } from '../utils/api';
import { PRIORITY_ICON, TagChip } from './Chips';
import { Modal } from './Modal';
import { useToast } from './Toast';

const TITLE_MAX = 200;
const MEMO_MAX = 2000;
const TAG_NAME_MAX = 20;
const TAGS_MAX = 10;
const WEEKDAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일'];

type Repeat = 'none' | RuleType;

interface TaskModalProps {
  /** null이면 새 할 일 등록 */
  task: Task | null;
  defaultDate: string;
  onClose: () => void;
  onDelete: (task: Task) => void;
}

interface FormErrors {
  title?: string;
  taskDate?: string;
  dueDate?: string;
  memo?: string;
  tags?: string;
  repeat?: string;
}

const toTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** SCR-02 할 일 등록·수정 */
export function TaskModal({ task, defaultDate, onClose, onDelete }: TaskModalProps) {
  const toast = useToast();
  const isEdit = task !== null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [taskDate, setTaskDate] = useState(task?.taskDate ?? defaultDate);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [remindTime, setRemindTime] = useState(toTime(task?.remindAt ?? null));
  const [memo, setMemo] = useState(task?.memo ?? '');
  const [tags, setTags] = useState<Tag[]>(task?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(Number(defaultDate.slice(8, 10)));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    call(api.tag.list()).then((r) => setAllTags(r.items)).catch(() => setAllTags([]));
    if (task) call(api.task.history({ id: task.id })).then((r) => setHistory(r.history)).catch(() => undefined);
  }, [task]);

  const isRepeating = repeat !== 'none';

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (title.trim() === '') next.title = '제목을 입력하세요.';
    else if (title.trim().length > TITLE_MAX) next.title = `제목은 ${TITLE_MAX}자까지 입력할 수 있습니다.`;
    if (!taskDate) next.taskDate = '날짜를 선택하세요.';
    if (dueDate && taskDate && dueDate < taskDate) next.dueDate = '마감일은 날짜보다 빠를 수 없습니다.';
    if (memo.length > MEMO_MAX) next.memo = '메모는 2,000자까지 입력할 수 있습니다.';
    if (repeat === 'weekly' && weekdays.length === 0) next.repeat = '반복할 요일을 선택하세요.';
    return next;
  };

  const addTag = async (): Promise<void> => {
    const name = tagInput.trim().replace(/^#/, '');
    if (!name) return;
    if (name.length > TAG_NAME_MAX) return setErrors({ ...errors, tags: `태그는 ${TAG_NAME_MAX}자까지입니다.` });
    if (tags.length >= TAGS_MAX) return setErrors({ ...errors, tags: '태그는 10개까지 붙일 수 있습니다.' });
    try {
      const tag = allTags.find((t) => t.name === name) ?? (await call(api.tag.save({ name })));
      if (!tags.some((t) => t.id === tag.id)) setTags([...tags, tag]);
      if (!allTags.some((t) => t.id === tag.id)) setAllTags([...allTags, tag]);
      setTagInput('');
      setErrors({ ...errors, tags: undefined });
    } catch (err) {
      setErrors({ ...errors, tags: errorMessage(err) });
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      if (isRepeating) {
        await call(
          api.recurrence.save({
            title: title.trim(),
            memo: memo || null,
            priority,
            ruleType: repeat,
            weekdays,
            monthDay,
            startDate: taskDate,
          }),
        );
      } else {
        const fields = {
          title: title.trim(),
          taskDate,
          priority,
          memo: memo || null,
          dueDate: dueDate || null,
          remindAt: remindTime ? new Date(`${taskDate}T${remindTime}`).toISOString() : null,
          tagIds: tags.map((t) => t.id),
        };
        await call(task ? api.task.update({ id: task.id, ...fields }) : api.task.create(fields));
      }
      toast('저장되었습니다.');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const suggestions = allTags.filter((t) => !tags.some((own) => own.id === t.id));

  return (
    <Modal
      title={isEdit ? '할 일 수정' : '할 일 추가'}
      onClose={onClose}
      footer={
        <>
          {isEdit &&
            (confirmDelete ? (
              <button type="button" className="button button--danger" onClick={() => onDelete(task)}>
                삭제 확인
              </button>
            ) : (
              <button type="button" className="button button--ghost-danger" onClick={() => setConfirmDelete(true)}>
                삭제
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="task-form" className="button button--primary" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <form id="task-form" className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">제목 *</span>
          <input
            autoFocus
            className="input"
            value={title}
            maxLength={TITLE_MAX + 50}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && <span className="field__error">{errors.title}</span>}
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">날짜 *</span>
            <input
              type="date"
              className="input"
              value={taskDate}
              disabled={task?.status === 'postponed'}
              onChange={(e) => setTaskDate(e.target.value)}
            />
            {errors.taskDate && <span className="field__error">{errors.taskDate}</span>}
          </label>
          <div className="field">
            <span className="field__label">우선순위</span>
            <div className="segmented" role="radiogroup" aria-label="우선순위">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={priority === p}
                  className={`segmented__item priority--${p}${priority === p ? ' segmented__item--active' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {PRIORITY_ICON[p]} {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">마감일</span>
            <input
              type="date"
              className="input"
              value={dueDate}
              disabled={isRepeating}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {errors.dueDate && <span className="field__error">{errors.dueDate}</span>}
          </label>
          <label className="field">
            <span className="field__label">알림</span>
            <input
              type="time"
              className="input"
              value={remindTime}
              disabled={isRepeating}
              onChange={(e) => setRemindTime(e.target.value)}
            />
          </label>
        </div>

        {!isEdit && (
          <div className="field">
            <span className="field__label">반복</span>
            <div className="form__inline">
              <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                <option value="none">없음</option>
                <option value="daily">매일</option>
                <option value="weekdays">평일 (월~금)</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
              </select>
              {repeat === 'weekly' &&
                WEEKDAY_OPTIONS.map((label, i) => (
                  <label key={label} className="check">
                    <input
                      type="checkbox"
                      checked={weekdays.includes(i + 1)}
                      onChange={(e) =>
                        setWeekdays(e.target.checked ? [...weekdays, i + 1] : weekdays.filter((d) => d !== i + 1))
                      }
                    />
                    {label}
                  </label>
                ))}
              {repeat === 'monthly' && (
                <select className="input" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              )}
            </div>
            {isRepeating && (
              <span className="field__hint">
                반복 규칙으로 저장합니다. 마감일·알림·태그는 만들어진 할 일에서 따로 설정하세요. 규칙은 설정에서 관리합니다.
              </span>
            )}
            {errors.repeat && <span className="field__error">{errors.repeat}</span>}
          </div>
        )}
        {isEdit && task.recurrenceRuleId !== null && <p className="field__hint">↻ 반복 규칙으로 만들어진 할 일입니다.</p>}

        {!isRepeating && (
          <div className="field">
            <span className="field__label">태그</span>
            <div className="tag-input">
              {tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} onRemove={() => setTags(tags.filter((t) => t.id !== tag.id))} />
              ))}
              <input
                className="tag-input__field"
                list="tag-suggestions"
                placeholder="+ 태그 (Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addTag();
                  }
                }}
              />
              <datalist id="tag-suggestions">
                {suggestions.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </div>
            {errors.tags && <span className="field__error">{errors.tags}</span>}
          </div>
        )}

        <label className="field">
          <span className="field__label">메모</span>
          <textarea className="input input--area" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
          {errors.memo && <span className="field__error">{errors.memo}</span>}
        </label>

        {isEdit && history.length > 0 && (
          <div className="field">
            <span className="field__label">상태 이력</span>
            <ul className="history">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="history__date">{formatShort(h.taskDate)}</span>
                  {h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : '등록 → '}
                  {STATUS_LABELS[h.toStatus]}
                  {h.postponeDate && ` (${formatShort(h.postponeDate)}로)`}
                  {h.reason && <span className="history__reason"> “{h.reason}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}
