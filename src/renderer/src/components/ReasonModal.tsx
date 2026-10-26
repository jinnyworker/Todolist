import { useEffect, useState } from 'react';

import { addDays, formatDateLabel, today, weekStartOf } from '@shared/dates';
import type { Task } from '@shared/types';

import { api, call, errorMessage } from '../utils/api';
import { Modal } from './Modal';
import { useToast } from './Toast';

const REASON_MAX = 200;

interface ReasonModalProps {
  task: Task;
  mode: 'postponed' | 'canceled';
  onClose: () => void;
}

/** SCR-04 연기·취소 사유 입력 */
export function ReasonModal({ task, mode, onClose }: ReasonModalProps) {
  const toast = useToast();
  const isPostpone = mode === 'postponed';
  // 빠른 선택의 기준일: 오늘과 할 일 날짜 중 늦은 날
  const base = task.taskDate > today() ? task.taskDate : today();
  const [postponeDate, setPostponeDate] = useState(addDays(base, 1));
  const [reason, setReason] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call(api.task.history({ recentReasons: { status: mode, limit: 5 } }))
      .then((r) => setRecent(r.reasons))
      .catch(() => setRecent([]));
  }, [mode]);

  const submit = async (): Promise<void> => {
    if (reason.trim() === '') return setError('사유를 입력하세요.');
    if (reason.trim().length > REASON_MAX) return setError(`사유는 ${REASON_MAX}자까지 입력할 수 있습니다.`);
    if (isPostpone && !(postponeDate > task.taskDate)) return setError('연기 날짜는 원래 날짜보다 뒤여야 합니다.');
    setSaving(true);
    try {
      await call(
        api.task.changeStatus({
          id: task.id,
          status: mode,
          reason: reason.trim(),
          postponeDate: isPostpone ? postponeDate : undefined,
        }),
      );
      toast(isPostpone ? `${formatDateLabel(postponeDate)}로 연기했습니다.` : '취소 처리했습니다.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const quickDates = [
    { label: '내일', value: addDays(base, 1) },
    { label: '다음 주 월요일', value: addDays(weekStartOf(base), 7) },
  ];

  return (
    <Modal
      title={isPostpone ? '연기하기' : '취소하기'}
      width={440}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className={`button ${isPostpone ? 'button--primary' : 'button--danger'}`}
            disabled={saving}
            onClick={submit}
          >
            {isPostpone ? '연기' : '취소 처리'}
          </button>
        </>
      }
    >
      <p className="reason__task">{task.title}</p>
      {isPostpone && (
        <div className="field">
          <span className="field__label">연기 날짜 *</span>
          <div className="form__inline">
            {quickDates.map((q) => (
              <button
                key={q.label}
                type="button"
                className={`button button--small${postponeDate === q.value ? ' button--selected' : ''}`}
                onClick={() => setPostponeDate(q.value)}
              >
                {q.label}
              </button>
            ))}
            <input
              type="date"
              className="input"
              min={addDays(task.taskDate, 1)}
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
            />
          </div>
        </div>
      )}
      <label className="field">
        <span className="field__label">사유 *</span>
        <input
          autoFocus
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </label>
      {recent.length > 0 && (
        <div className="form__inline">
          <span className="field__hint">최근 사유</span>
          {recent.map((r) => (
            <button key={r} type="button" className="chip chip--button" onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      {error && <p className="field__error">{error}</p>}
    </Modal>
  );
}
