import type { Database } from '../db/database';
import type { Settings } from '../../shared/types';
import { invalid } from '../errors';
import { nowIso, requireObject } from './validate';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_SETTINGS: Settings = {
  morningReminderEnabled: false,
  morningReminderTime: '08:30',
  taskReminderEnabled: true,
};

const KEY_MAP: Record<keyof Settings, string> = {
  morningReminderEnabled: 'morning_reminder_enabled',
  morningReminderTime: 'morning_reminder_time',
  taskReminderEnabled: 'task_reminder_enabled',
};

/** 화면에 노출하지 않는 내부 상태 키. */
export const INTERNAL_KEYS = {
  MORNING_REMINDER_LAST_DATE: 'morning_reminder_last_date',
  TRAY_NOTICE_SHOWN: 'tray_notice_shown',
} as const;

export class SettingsService {
  constructor(private readonly db: Database) {}

  get(): Settings {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM app_setting');
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const read = (key: keyof Settings): string | undefined => values.get(KEY_MAP[key]);
    return {
      morningReminderEnabled: (read('morningReminderEnabled') ?? String(DEFAULT_SETTINGS.morningReminderEnabled)) === 'true',
      morningReminderTime: read('morningReminderTime') ?? DEFAULT_SETTINGS.morningReminderTime,
      taskReminderEnabled: (read('taskReminderEnabled') ?? String(DEFAULT_SETTINGS.taskReminderEnabled)) === 'true',
    };
  }

  update(raw: unknown): Settings {
    const input = requireObject(raw);
    for (const key of Object.keys(input)) {
      if (!(key in KEY_MAP)) throw invalid(`알 수 없는 설정입니다: ${key}`);
    }
    if (input.morningReminderTime !== undefined && !TIME_RE.test(String(input.morningReminderTime))) {
      throw invalid('시각 형식이 올바르지 않습니다.');
    }
    for (const key of ['morningReminderEnabled', 'taskReminderEnabled'] as const) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') throw invalid('설정 값이 올바르지 않습니다.');
    }
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(input)) {
        this.setRaw(KEY_MAP[key as keyof Settings], String(value));
      }
    });
    return this.get();
  }

  getRaw(key: string): string | undefined {
    return this.db.get<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [key])?.value;
  }

  setRaw(key: string, value: string): void {
    this.db.run(
      `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()],
    );
  }
}
