import { Notification } from 'electron';

import { today } from '../shared/dates';
import type { Services } from './services';
import { INTERNAL_KEYS } from './services/settingsService';

const TICK_MS = 30_000;

interface SchedulerHooks {
  showWindow: () => void;
  openBulk: () => void;
  onDateChanged: (date: string) => void;
}

/**
 * 30초마다 날짜 변경(반복 할 일 생성), 아침 등록 알림, 할 일 알림을 확인한다.
 * 창이 닫혀 트레이에 있어도 Main 프로세스에서 계속 돈다.
 */
export function startScheduler(services: Services, hooks: SchedulerHooks): () => void {
  let currentDate = today();
  let lastCheck = new Date().toISOString();

  const tick = (): void => {
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const date = today();

      if (date !== currentDate) {
        currentDate = date;
        services.recurrence.generateDue(date);
        services.db.save();
        hooks.onDateChanged(date);
      }
      checkMorningReminder(services, hooks, now, date);
      checkTaskReminders(services, hooks, lastCheck, nowIso);
      lastCheck = nowIso;
    } catch (err) {
      console.error('scheduler tick failed', err);
    }
  };

  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
}

function checkMorningReminder(services: Services, hooks: SchedulerHooks, now: Date, date: string): void {
  const settings = services.settings.get();
  if (!settings.morningReminderEnabled) return;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm < settings.morningReminderTime) return;
  if (services.settings.getRaw(INTERNAL_KEYS.MORNING_REMINDER_LAST_DATE) === date) return;

  services.settings.setRaw(INTERNAL_KEYS.MORNING_REMINDER_LAST_DATE, date);
  services.db.save();
  notify('오늘 할 일을 등록하세요', '눌러서 아침 일괄 등록을 엽니다.', () => {
    hooks.showWindow();
    hooks.openBulk();
  });
}

function checkTaskReminders(services: Services, hooks: SchedulerHooks, from: string, to: string): void {
  if (!services.settings.get().taskReminderEnabled) return;
  const due = services.db.all<{ title: string; task_date: string }>(
    `SELECT title, task_date FROM task
     WHERE remind_at > ? AND remind_at <= ? AND status IN ('waiting', 'in_progress')`,
    [from, to],
  );
  for (const task of due) notify(task.title, `${task.task_date} 할 일 알림`, hooks.showWindow);
}

export function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  if (onClick) notification.on('click', onClick);
  notification.show();
}
