/** Renderer → Main 요청 채널 (API 명세서의 API-01~20). */
export const IPC_CHANNELS = {
  TASK_LIST: 'task:list',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_BULK_CREATE: 'task:bulk-create',
  TASK_REORDER: 'task:reorder',
  TASK_CHANGE_STATUS: 'task:change-status',
  TASK_HISTORY: 'task:history',
  CALENDAR_MONTH_SUMMARY: 'calendar:month-summary',
  STATS_WEEKLY: 'stats:weekly',
  TAG_LIST: 'tag:list',
  TAG_SAVE: 'tag:save',
  TAG_DELETE: 'tag:delete',
  RECURRENCE_LIST: 'recurrence:list',
  RECURRENCE_SAVE: 'recurrence:save',
  RECURRENCE_DELETE: 'recurrence:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  DATA_EXPORT: 'data:export',
  SHARE_EXPORT: 'share:export',
} as const;

/** Main → Renderer 이벤트 채널. */
export const UI_EVENTS = {
  OPEN_BULK: 'ui:open-bulk',
  DATE_CHANGED: 'ui:date-changed',
  DATA_CHANGED: 'ui:data-changed',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type UiEvent = (typeof UI_EVENTS)[keyof typeof UI_EVENTS];
