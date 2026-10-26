import type { Database } from '../db/database';
import { RecurrenceService } from './recurrenceService';
import { SettingsService } from './settingsService';
import { ShareService } from './shareService';
import { StatsService } from './statsService';
import { TagService } from './tagService';
import { TaskService } from './taskService';

export interface Services {
  db: Database;
  tasks: TaskService;
  stats: StatsService;
  tags: TagService;
  recurrence: RecurrenceService;
  settings: SettingsService;
  share: ShareService;
}

export function createServices(db: Database): Services {
  const tasks = new TaskService(db);
  const stats = new StatsService(db);
  return {
    db,
    tasks,
    stats,
    tags: new TagService(db),
    recurrence: new RecurrenceService(db, tasks),
    settings: new SettingsService(db),
    share: new ShareService(tasks, stats),
  };
}
