import { today, weekStartOf } from '@shared/dates';

import { useLoad } from '../hooks/useLoad';
import { routes, type Route } from '../hooks/useHashRoute';
import { api } from '../utils/api';

const NAV: { name: Route['name']; label: string; href: () => string }[] = [
  { name: 'day', label: '오늘', href: () => routes.day(today()) },
  { name: 'calendar', label: '달력', href: () => routes.calendar(today().slice(0, 7)) },
  { name: 'stats', label: '주간 통계', href: () => routes.stats(weekStartOf(today())) },
  { name: 'settings', label: '설정', href: routes.settings },
];

export function Sidebar({ route, todayDate }: { route: Route; todayDate: string }) {
  const { data } = useLoad(() => api.task.list({ date: todayDate }), [todayDate]);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">✓ TODOLIST</div>
      <nav className="sidebar__nav">
        {NAV.map((item) => (
          <a
            key={item.name}
            href={item.href()}
            className={`sidebar__link${route.name === item.name ? ' sidebar__link--active' : ''}`}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {data && (
        <div className="sidebar__summary" title="오늘 완료 / 전체">
          <span>오늘</span>
          <strong>
            {data.summary.done}/{data.summary.total}
          </strong>
          <div className="progress">
            <div
              className="progress__bar"
              style={{ width: `${data.summary.total ? (data.summary.done / data.summary.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
