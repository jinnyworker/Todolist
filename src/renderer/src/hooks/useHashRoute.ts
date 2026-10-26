import { useEffect, useState } from 'react';

import { isValidDate, today, weekStartOf } from '@shared/dates';

export type Route =
  | { name: 'day'; date: string }
  | { name: 'calendar'; month: string }
  | { name: 'stats'; weekStart: string }
  | { name: 'settings' };

const MONTH_RE = /^\d{4}-\d{2}$/;

export function parseHash(hash: string): Route {
  const [, page, a, b] = hash.replace(/^#/, '').split('/');
  if (page === 'calendar' && MONTH_RE.test(a ?? '')) return { name: 'calendar', month: a };
  if (page === 'calendar') return { name: 'calendar', month: today().slice(0, 7) };
  if (page === 'stats') {
    const start = a === 'week' && isValidDate(b) ? weekStartOf(b) : weekStartOf(today());
    return { name: 'stats', weekStart: start };
  }
  if (page === 'settings') return { name: 'settings' };
  return { name: 'day', date: page === 'day' && isValidDate(a) ? a : today() };
}

export const routes = {
  day: (date: string) => `#/day/${date}`,
  calendar: (month: string) => `#/calendar/${month}`,
  stats: (weekStart: string) => `#/stats/week/${weekStart}`,
  settings: () => '#/settings',
};

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
