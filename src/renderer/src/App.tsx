import { useCallback, useEffect, useState } from 'react';

import { today } from '@shared/dates';
import { UI_EVENTS } from '@shared/ipc-channels';

import { BulkModal } from './components/BulkModal';
import { Sidebar } from './components/Sidebar';
import { navigate, routes, useHashRoute } from './hooks/useHashRoute';
import { CalendarPage } from './pages/CalendarPage';
import { DayPage } from './pages/DayPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { api } from './utils/api';

export function App() {
  const route = useHashRoute();
  const [todayDate, setTodayDate] = useState(today());
  const [bulkDate, setBulkDate] = useState<string | null>(null);
  const [dateChanged, setDateChanged] = useState(false);

  const currentDate = route.name === 'day' ? route.date : todayDate;
  const openBulk = useCallback(() => setBulkDate(currentDate), [currentDate]);

  useEffect(() => {
    const offBulk = api.on(UI_EVENTS.OPEN_BULK, () => {
      navigate(routes.day(today()));
      setBulkDate(today());
    });
    // 앱이 켜진 채 자정을 넘기면 오늘로 이동할지 묻는다.
    const offDate = api.on(UI_EVENTS.DATE_CHANGED, () => {
      setTodayDate(today());
      setDateChanged(true);
    });
    return () => {
      offBulk();
      offDate();
    };
  }, []);

  return (
    <div className="app">
      <Sidebar route={route} todayDate={todayDate} />
      <main className="app__main">
        {dateChanged && (
          <div className="banner">
            날짜가 바뀌었습니다.
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                setDateChanged(false);
                navigate(routes.day(today()));
              }}
            >
              오늘로 이동
            </button>
            <button type="button" className="icon-button" aria-label="닫기" onClick={() => setDateChanged(false)}>
              ✕
            </button>
          </div>
        )}
        {route.name === 'day' && <DayPage date={route.date} onOpenBulk={openBulk} modalOpen={bulkDate !== null} />}
        {route.name === 'calendar' && <CalendarPage month={route.month} />}
        {route.name === 'stats' && <StatsPage weekStart={route.weekStart} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      {bulkDate && <BulkModal date={bulkDate} onClose={() => setBulkDate(null)} />}
    </div>
  );
}
