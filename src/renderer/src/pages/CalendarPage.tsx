import { daysInMonth, isoWeekday, today } from '@shared/dates';
import { TASK_STATUSES, type DaySummary } from '@shared/types';

import { navigate, routes } from '../hooks/useHashRoute';
import { useLoad } from '../hooks/useLoad';
import { api } from '../utils/api';

const WEEKDAY_HEADERS = ['월', '화', '수', '목', '금', '토', '일'];
const MAX_DOTS = 5;

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 날짜별 상태 점: 상태 순서대로 최대 5개 */
function dots(day: DaySummary): string[] {
  return TASK_STATUSES.flatMap((s) => Array<string>(day[s]).fill(s)).slice(0, MAX_DOTS);
}

/** SCR-05 달력 */
export function CalendarPage({ month }: { month: string }) {
  const { data, error, reload } = useLoad(() => api.calendar.monthSummary(month), [month]);
  const [year, mon] = month.split('-').map(Number);
  const leading = isoWeekday(`${month}-01`) - 1;
  const total = daysInMonth(year, mon);
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const todayDate = today();

  return (
    <section className="page">
      <header className="page__header">
        <div className="date-nav">
          <button type="button" className="icon-button" aria-label="이전 달" onClick={() => navigate(routes.calendar(shiftMonth(month, -1)))}>
            ◀
          </button>
          <span className="date-nav__label">
            {year}년 {mon}월
          </span>
          <button type="button" className="icon-button" aria-label="다음 달" onClick={() => navigate(routes.calendar(shiftMonth(month, 1)))}>
            ▶
          </button>
          <button type="button" className="button button--small" onClick={() => navigate(routes.calendar(todayDate.slice(0, 7)))}>
            오늘
          </button>
        </div>
      </header>
      {error ? (
        <div className="empty">
          <p>달력을 불러오지 못했습니다.</p>
          <button type="button" className="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : (
        <div className="calendar">
          {WEEKDAY_HEADERS.map((w) => (
            <div key={w} className="calendar__head">
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} className="calendar__cell calendar__cell--blank" />;
            const day = byDate.get(date);
            return (
              <button
                key={date}
                type="button"
                className={`calendar__cell${date === todayDate ? ' calendar__cell--today' : ''}`}
                onClick={() => navigate(routes.day(date))}
              >
                <span className="calendar__day">{Number(date.slice(8))}</span>
                {day && (
                  <>
                    <span className="calendar__count">
                      {day.done}/{day.total}
                    </span>
                    <span className="calendar__dots">
                      {dots(day).map((s, j) => (
                        <span key={j} className={`dot dot--${s}`} />
                      ))}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
