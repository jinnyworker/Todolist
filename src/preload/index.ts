import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC_CHANNELS as C, UI_EVENTS, type IpcChannel, type UiEvent } from '../shared/ipc-channels';
import type {
  ApiResult,
  BulkCreateInput,
  ChangeStatusInput,
  ChangeStatusResult,
  ExportInput,
  HistoryInput,
  HistoryResult,
  MonthSummary,
  RecurrenceRule,
  RecurrenceSaveInput,
  ReorderInput,
  Settings,
  ShareInput,
  ShareResult,
  Tag,
  TagSaveInput,
  TagWithCount,
  Task,
  TaskCreateInput,
  TaskListInput,
  TaskListResult,
  TaskUpdateInput,
  WeeklyStats,
} from '../shared/types';

const invoke = <T>(channel: IpcChannel, payload?: unknown): Promise<ApiResult<T>> =>
  ipcRenderer.invoke(channel, payload);

const ALLOWED_EVENTS = Object.values(UI_EVENTS) as string[];

const electronAPI = {
  task: {
    list: (input: TaskListInput) => invoke<TaskListResult>(C.TASK_LIST, input),
    create: (input: TaskCreateInput) => invoke<Task>(C.TASK_CREATE, input),
    update: (input: TaskUpdateInput) => invoke<Task>(C.TASK_UPDATE, input),
    delete: (id: number) => invoke<{ id: number }>(C.TASK_DELETE, { id }),
    bulkCreate: (input: BulkCreateInput) => invoke<{ items: Task[]; count: number }>(C.TASK_BULK_CREATE, input),
    reorder: (input: ReorderInput) => invoke<{ updated: number }>(C.TASK_REORDER, input),
    changeStatus: (input: ChangeStatusInput) => invoke<ChangeStatusResult>(C.TASK_CHANGE_STATUS, input),
    history: (input: HistoryInput) => invoke<HistoryResult>(C.TASK_HISTORY, input),
  },
  calendar: {
    monthSummary: (month: string) => invoke<MonthSummary>(C.CALENDAR_MONTH_SUMMARY, { month }),
  },
  stats: {
    weekly: (input: { weekStart: string }) => invoke<WeeklyStats>(C.STATS_WEEKLY, input),
  },
  tag: {
    list: () => invoke<{ items: TagWithCount[] }>(C.TAG_LIST),
    save: (input: TagSaveInput) => invoke<Tag>(C.TAG_SAVE, input),
    delete: (id: number) => invoke<{ id: number }>(C.TAG_DELETE, { id }),
  },
  recurrence: {
    list: () => invoke<{ items: RecurrenceRule[] }>(C.RECURRENCE_LIST),
    save: (input: RecurrenceSaveInput) =>
      invoke<RecurrenceRule & { generatedCount: number }>(C.RECURRENCE_SAVE, input),
    delete: (id: number) => invoke<{ id: number }>(C.RECURRENCE_DELETE, { id }),
  },
  settings: {
    get: () => invoke<Settings>(C.SETTINGS_GET),
    update: (input: Partial<Settings>) => invoke<Settings>(C.SETTINGS_UPDATE, input),
  },
  data: {
    export: (input: ExportInput) => invoke<{ path: string; bytes: number }>(C.DATA_EXPORT, input),
  },
  share: {
    export: (input: ShareInput) => invoke<ShareResult>(C.SHARE_EXPORT, input),
  },
  /** Main → Renderer 이벤트 구독. 해제 함수를 돌려준다. */
  on: (event: UiEvent, callback: (payload: unknown) => void): (() => void) => {
    if (!ALLOWED_EVENTS.includes(event)) return () => undefined;
    const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
};

export type ElectronAPI = typeof electronAPI;

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
