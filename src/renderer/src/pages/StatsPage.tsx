import { useState } from 'react';

import { addDays, formatShort, today, weekStartOf, weekdayLabel } from '@shared/dates';
import { STATUS_LABELS, TASK_STATUSES, type ReasonCount } from '@shared/types';

import { ShareModal } from '../components/ShareModal';
import { navigate, routes } from '../hooks/useHashRoute';
import { useLoad } from '../hooks/useLoad';
import { api } from '../utils/api';

function ReasonList({ title, items }: { title: string; items: ReasonCount[] }) {
  return (
    <div className="card">
      <h3 className="card__title">{title}</h3>
      {items.length === 0 ? (
        <p className="muted">없음</p>
      ) : (
        <ul className="reason-list">
          {items.map((r) => (
            <li key={r.reason}>
              <span>{r.reason}</span>
              <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** SCR-06 주간 통계 */
export function StatsPage({ weekStart }: { weekStart: string }) {
  const [sharing, setSharing] = useState(false);
  const { data, error, showSkeleton, reload } = useLoad(() => api.stats.weekly({ weekStart }), [weekStart]);
  const maxTotal = Math.max(1, ...(data?.byDay ?? []).map((d) => TASK_STATUSES.reduce((sum, s) => sum + d[s], 0)));
  const title = `${weekStart} ~ ${formatShort(addDays(weekStart, 6))}`;

  return (
    <section className="page">
      <header className="page__header">
        <div className="date-nav">
          <button type="button" className="icon-button" aria-label="이전 주" onClick={() => navigate(routes.stats(addDays(weekStart, -7)))}>
            ◀
          </button>
          <span className="date-nav__label">{title}</span>
          <button type="button" className="icon-button" aria-label="다음 주" onClick={() => navigate(routes.stats(addDays(weekStart, 7)))}>
            ▶
          </button>
          <button type="button" className="button button--small" onClick={() => navigate(routes.stats(weekStartOf(today())))}>
            이번 주
          </button>
        </div>
        <div className="page__actions">
          <button type="button" className="button" disabled={!data?.totals.total} onClick={() => setSharing(true)}>
            공유
          </button>
        </div>
      </header>

      {error ? (
        <div className="empty">
          <p>통계를 불러오지 못했습니다.</p>
          <button type="button" className="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : !data ? (
        showSkeleton && <div className="skeleton-list"><div /><div /></div>
      ) : data.totals.total === 0 ? (
        <div className="empty">
          <p>이 주에는 기록된 할 일이 없습니다.</p>
        </div>
      ) : (
        <div className="stats" id="stats-capture">
          <div className="stats__tiles">
            <div className="tile tile--main">
              <span className="tile__label">완료율</span>
              <strong className="tile__value">{data.completionRate}%</strong>
              <span className="tile__hint">완료 ÷ (전체 − 취소)</span>
            </div>
            <div className="tile">
              <span className="tile__label">전체</span>
              <strong className="tile__value">{data.totals.total}</strong>
            </div>
            {TASK_STATUSES.map((s) => (
              <div key={s} className={`tile tile--${s}`}>
                <span className="tile__label">{STATUS_LABELS[s]}</span>
                <strong className="tile__value">{data.totals[s]}</strong>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="card__title">요일별</h3>
            <div className="bars">
              {data.byDay.map((day) => {
                const total = TASK_STATUSES.reduce((sum, s) => sum + day[s], 0);
                return (
                  <button
                    key={day.date}
                    type="button"
                    className="bars__col"
                    title={TASK_STATUSES.map((s) => `${STATUS_LABELS[s]} ${day[s]}`).join(' · ')}
                    onClick={() => navigate(routes.day(day.date))}
                  >
                    <span className="bars__total">{total || ''}</span>
                    <span className="bars__stack" style={{ height: `${(total / maxTotal) * 100}%` }}>
                      {TASK_STATUSES.filter((s) => day[s] > 0).map((s) => (
                        <span key={s} className={`bars__seg dot--${s}`} style={{ flexGrow: day[s] }} />
                      ))}
                    </span>
                    <span className="bars__label">
                      {weekdayLabel(day.date)} {formatShort(day.date)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="legend">
              {TASK_STATUSES.map((s) => (
                <span key={s}>
                  <span className={`dot dot--${s}`} /> {STATUS_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          <div className="stats__grid">
            <ReasonList title="연기 사유" items={data.postponeReasons} />
            <ReasonList title="취소 사유" items={data.cancelReasons} />
            <div className="card">
              <h3 className="card__title">2회 이상 연기된 할 일</h3>
              {data.repeatedlyPostponed.length === 0 ? (
                <p className="muted">없음</p>
              ) : (
                <ul className="reason-list">
                  {data.repeatedlyPostponed.map((r) => (
                    <li key={r.latestTaskId}>
                      <span>{r.title}</span>
                      <strong>{r.count}회</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {sharing && (
        <ShareModal
          title={`주간 통계 ${title}`}
          scope={{ scope: 'week', weekStart }}
          captureSelector="#stats-capture"
          onClose={() => setSharing(false)}
        />
      )}
    </section>
  );
}
