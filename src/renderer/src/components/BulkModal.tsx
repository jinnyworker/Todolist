import { useState } from 'react';

import { BULK_MAX, TITLE_MAX, parseBulkText } from '@shared/bulk';
import { formatDateLabel } from '@shared/dates';
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '@shared/types';

import { api, call, errorMessage } from '../utils/api';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** SCR-03 아침 일괄 등록 */
export function BulkModal({ date, onClose }: { date: string; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [saving, setSaving] = useState(false);

  const titles = parseBulkText(text);
  const longLines = titles.map((t, i) => (t.length > TITLE_MAX ? i + 1 : 0)).filter(Boolean);
  const error =
    longLines.length > 0
      ? `${longLines.join(', ')}번째 줄이 ${TITLE_MAX}자를 넘습니다.`
      : titles.length > BULK_MAX
        ? `한 번에 ${BULK_MAX}건까지 등록할 수 있습니다.`
        : null;
  const disabled = titles.length === 0 || error !== null || saving;

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      const { count } = await call(api.task.bulkCreate({ taskDate: date, text, priority }));
      toast(`${count}건을 등록했습니다.`);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`아침 일괄 등록 · ${formatDateLabel(date)}`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="button button--primary" disabled={disabled} onClick={submit}>
            {titles.length}건 등록
          </button>
        </>
      }
    >
      <p className="field__hint">한 줄에 하나씩 입력하세요. 목록 기호(-, *, 1.)와 빈 줄은 무시합니다.</p>
      <textarea
        autoFocus
        className="input input--area input--bulk"
        rows={10}
        placeholder={'- 제안서 초안 작성\n- 고객 메일 회신\n- 운동 30분'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey && !disabled) void submit();
        }}
      />
      <div className="form__inline">
        <span>
          미리보기: <strong>{titles.length}건</strong>
        </span>
        <span className="spacer" />
        <label className="form__inline">
          기본 우선순위
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="field__error">{error}</p>}
    </Modal>
  );
}
