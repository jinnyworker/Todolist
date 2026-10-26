import { useState, type FormEvent } from 'react';

import { today } from '@shared/dates';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
  type RecurrenceRule,
  type RuleType,
  type TagWithCount,
} from '@shared/types';

import { useToast } from '../components/Toast';
import { useLoad } from '../hooks/useLoad';
import { api, call, errorMessage, isCanceled } from '../utils/api';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const RULE_LABELS: Record<RuleType, string> = { daily: '매일', weekdays: '평일', weekly: '매주', monthly: '매월' };

function describeRule(rule: RecurrenceRule): string {
  if (rule.ruleType === 'weekly') return `매주 ${rule.weekdays.map((d) => WEEKDAYS[d - 1]).join('·')}`;
  if (rule.ruleType === 'monthly') return `매월 ${rule.monthDay}일`;
  return RULE_LABELS[rule.ruleType];
}

/** 실패하면 토스트로 알리는 호출 도우미 */
function useRunner() {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (err) {
      if (!isCanceled(err)) toast(errorMessage(err), { tone: 'error' });
      return false;
    }
  };
}

function TagRow({ tag }: { tag: TagWithCount }) {
  const runner = useRunner();
  const [name, setName] = useState(tag.name);
  const [confirm, setConfirm] = useState(false);
  const save = (color: string | null = tag.color): void => {
    if (name.trim() === tag.name && color === tag.color) return;
    void runner(() => call(api.tag.save({ id: tag.id, name: name.trim(), color })), '저장되었습니다.').then(
      (ok) => !ok && setName(tag.name),
    );
  };
  return (
    <tr>
      <td>
        <input className="input input--small" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onBlur={() => save()} />
      </td>
      <td>
        <input type="color" aria-label="태그 색" value={tag.color ?? '#64748b'} onChange={(e) => save(e.target.value)} />
      </td>
      <td className="num">{tag.taskCount}</td>
      <td className="actions">
        {confirm ? (
          <button type="button" className="button button--small button--danger" onClick={() => runner(() => call(api.tag.delete(tag.id)), '삭제되었습니다.')}>
            삭제 확인
          </button>
        ) : (
          <button type="button" className="button button--small button--ghost-danger" onClick={() => setConfirm(true)}>
            삭제
          </button>
        )}
      </td>
    </tr>
  );
}

function TagSection() {
  const runner = useRunner();
  const { data, error } = useLoad(() => api.tag.list(), []);
  const [name, setName] = useState('');
  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (await runner(() => call(api.tag.save({ name: name.trim() })), '추가되었습니다.')) setName('');
  };
  return (
    <section className="card">
      <h3 className="card__title">태그</h3>
      {error && <p className="field__error">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">아직 없습니다.</p>}
      {data && data.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>색</th>
              <th className="num">할 일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((tag) => (
              <TagRow key={`${tag.id}-${tag.name}`} tag={tag} />
            ))}
          </tbody>
        </table>
      )}
      <form className="form__inline" onSubmit={add}>
        <input className="input input--small" placeholder="새 태그 이름" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button button--small" disabled={!name.trim()}>
          추가
        </button>
      </form>
    </section>
  );
}

interface RuleDraft {
  id?: number;
  title: string;
  priority: Priority;
  ruleType: RuleType;
  weekdays: number[];
  monthDay: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const emptyDraft = (): RuleDraft => ({
  title: '',
  priority: 'normal',
  ruleType: 'daily',
  weekdays: [],
  monthDay: 1,
  startDate: today(),
  endDate: '',
  isActive: true,
});

function RuleForm({ draft, onDone }: { draft: RuleDraft; onDone: () => void }) {
  const runner = useRunner();
  const [form, setForm] = useState(draft);
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void => setForm({ ...form, [key]: value });
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await runner(
      () => call(api.recurrence.save({ ...form, title: form.title.trim(), endDate: form.endDate || null })),
      '저장되었습니다.',
    );
    if (ok) onDone();
  };
  return (
    <form className="rule-form" onSubmit={submit}>
      <input className="input" placeholder="제목" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />
      <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <select className="input" value={form.ruleType} onChange={(e) => set('ruleType', e.target.value as RuleType)}>
        {(Object.keys(RULE_LABELS) as RuleType[]).map((r) => (
          <option key={r} value={r}>
            {RULE_LABELS[r]}
          </option>
        ))}
      </select>
      {form.ruleType === 'weekly' &&
        WEEKDAYS.map((w, i) => (
          <label key={w} className="check">
            <input
              type="checkbox"
              checked={form.weekdays.includes(i + 1)}
              onChange={(e) => set('weekdays', e.target.checked ? [...form.weekdays, i + 1] : form.weekdays.filter((d) => d !== i + 1))}
            />
            {w}
          </label>
        ))}
      {form.ruleType === 'monthly' && (
        <select className="input" value={form.monthDay} onChange={(e) => set('monthDay', Number(e.target.value))}>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}일
            </option>
          ))}
        </select>
      )}
      <label className="form__inline">
        시작
        <input type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
      </label>
      <label className="form__inline">
        종료
        <input type="date" className="input" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
      </label>
      <button type="submit" className="button button--primary button--small" disabled={!form.title.trim()}>
        저장
      </button>
      <button type="button" className="button button--small" onClick={onDone}>
        취소
      </button>
    </form>
  );
}

function RecurrenceSection() {
  const runner = useRunner();
  const { data, error } = useLoad(() => api.recurrence.list(), []);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const toggle = (rule: RecurrenceRule): void => {
    void runner(() =>
      call(api.recurrence.save({ ...rule, monthDay: rule.monthDay, endDate: rule.endDate, isActive: !rule.isActive })),
    );
  };

  return (
    <section className="card">
      <h3 className="card__title">반복 규칙</h3>
      {error && <p className="field__error">{error}</p>}
      {data && data.items.length === 0 && !editing && <p className="muted">아직 없습니다.</p>}
      {data && data.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>제목</th>
              <th>반복</th>
              <th>기간</th>
              <th>사용</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((rule) => (
              <tr key={rule.id} className={rule.isActive ? '' : 'table__row--muted'}>
                <td>{rule.title}</td>
                <td>{describeRule(rule)}</td>
                <td>
                  {rule.startDate} ~ {rule.endDate ?? ''}
                </td>
                <td>
                  <input type="checkbox" aria-label="사용" checked={rule.isActive} onChange={() => toggle(rule)} />
                </td>
                <td className="actions">
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() =>
                      setEditing({ ...rule, monthDay: rule.monthDay ?? 1, endDate: rule.endDate ?? '' })
                    }
                  >
                    수정
                  </button>
                  {confirmId === rule.id ? (
                    <button
                      type="button"
                      className="button button--small button--danger"
                      onClick={() => runner(() => call(api.recurrence.delete(rule.id)), '삭제되었습니다. 이미 만든 할 일은 남습니다.')}
                    >
                      삭제 확인
                    </button>
                  ) : (
                    <button type="button" className="button button--small button--ghost-danger" onClick={() => setConfirmId(rule.id)}>
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <RuleForm key={editing.id ?? 'new'} draft={editing} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="button button--small" onClick={() => setEditing(emptyDraft())}>
          + 반복 규칙 추가
        </button>
      )}
    </section>
  );
}

function ReminderSection() {
  const runner = useRunner();
  const { data, error } = useLoad(() => api.settings.get(), []);
  if (error) return <p className="field__error">{error}</p>;
  if (!data) return null;
  const update = (patch: Parameters<typeof api.settings.update>[0]): void => {
    void runner(() => call(api.settings.update(patch)), '저장되었습니다.');
  };
  return (
    <section className="card">
      <h3 className="card__title">알림</h3>
      <label className="check">
        <input type="checkbox" checked={data.morningReminderEnabled} onChange={(e) => update({ morningReminderEnabled: e.target.checked })} />
        아침 등록 알림
        <input
          type="time"
          className="input input--small"
          value={data.morningReminderTime}
          disabled={!data.morningReminderEnabled}
          onChange={(e) => e.target.value && update({ morningReminderTime: e.target.value })}
        />
      </label>
      <p className="field__hint">지정한 시각에 “오늘 할 일을 등록하세요” 알림을 띄우고, 누르면 아침 일괄 등록을 엽니다.</p>
      <label className="check">
        <input type="checkbox" checked={data.taskReminderEnabled} onChange={(e) => update({ taskReminderEnabled: e.target.checked })} />
        할 일별 알림
      </label>
      <p className="field__hint">창을 닫아도 트레이에서 실행 중이면 알림이 옵니다.</p>
    </section>
  );
}

function BackupSection() {
  const runner = useRunner();
  const exportAs = (format: 'sqlite' | 'json'): void => {
    void runner(() => call(api.data.export({ format })), '내보냈습니다.');
  };
  return (
    <section className="card">
      <h3 className="card__title">백업</h3>
      <p className="field__hint">데이터는 이 PC에만 저장됩니다. 주기적으로 백업 파일을 내보내 두세요.</p>
      <div className="form__inline">
        <button type="button" className="button" onClick={() => exportAs('sqlite')}>
          DB 파일로 내보내기
        </button>
        <button type="button" className="button" onClick={() => exportAs('json')}>
          JSON으로 내보내기
        </button>
      </div>
    </section>
  );
}

/** SCR-07 설정 */
export function SettingsPage() {
  return (
    <section className="page">
      <header className="page__header">
        <h2 className="page__title">설정</h2>
      </header>
      <div className="settings">
        <ReminderSection />
        <TagSection />
        <RecurrenceSection />
        <BackupSection />
      </div>
    </section>
  );
}
