/** ERD.md v0.3 기준 스키마. 스키마를 바꾸면 SCHEMA_VERSION을 올리고 마이그레이션을 추가한다. */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS recurrence_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  memo TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  rule_type TEXT NOT NULL,
  weekdays TEXT,
  month_day INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_generated_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  memo TEXT,
  task_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  status_reason TEXT,
  postponed_to_date TEXT,
  postponed_from_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  recurrence_rule_id INTEGER REFERENCES recurrence_rule(id) ON DELETE SET NULL,
  due_date TEXT,
  remind_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_date_order ON task(task_date, priority, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_date_status ON task(task_date, status);
CREATE INDEX IF NOT EXISTS idx_task_postponed_from_id ON task(postponed_from_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_recurrence_date
  ON task(recurrence_rule_id, task_date) WHERE recurrence_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_remind_at ON task(remind_at);

CREATE TABLE IF NOT EXISTS task_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  postpone_date TEXT,
  changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_task_status_history_reason ON task_status_history(to_status, changed_at);

CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_name ON tag(name);

CREATE TABLE IF NOT EXISTS task_tag (
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tag_tag_id ON task_tag(tag_id);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
