export const TASK_STATUSES = ['waiting', 'in_progress', 'done', 'postponed', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['high', 'normal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RULE_TYPES = ['daily', 'weekdays', 'weekly', 'monthly'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | 'CANCELED';

export interface ApiError {
  code: ErrorCode;
  message: string;
  timestamp: string;
}

export type ApiResult<T> = { success: true; data: T } | { success: false; error: ApiError };

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface TagWithCount extends Tag {
  taskCount: number;
}

export interface Task {
  id: number;
  title: string;
  memo: string | null;
  taskDate: string;
  priority: Priority;
  sortOrder: number;
  status: TaskStatus;
  statusReason: string | null;
  postponedToDate: string | null;
  postponedFrom: { id: number; taskDate: string } | null;
  recurrenceRuleId: number | null;
  dueDate: string | null;
  remindAt: string | null;
  completedAt: string | null;
  tags: Tag[];
}

export type StatusCounts = Record<TaskStatus, number>;

export interface TaskListResult {
  date: string;
  items: Task[];
  summary: StatusCounts & { total: number };
}

export interface TaskListInput {
  date: string;
  tagIds?: number[];
  statuses?: TaskStatus[];
}

export interface TaskCreateInput {
  title: string;
  taskDate: string;
  priority?: Priority;
  memo?: string | null;
  dueDate?: string | null;
  remindAt?: string | null;
  tagIds?: number[];
}

export interface TaskUpdateInput extends Partial<TaskCreateInput> {
  id: number;
}

export interface BulkCreateInput {
  taskDate: string;
  text: string;
  priority?: Priority;
}

export interface ReorderInput {
  taskDate: string;
  priority: Priority;
  orderedIds: number[];
}

export interface ChangeStatusInput {
  id: number;
  status?: TaskStatus;
  reason?: string;
  postponeDate?: string;
  revert?: boolean;
}

export interface ChangeStatusResult {
  task: Task;
  createdTask: Task | null;
}

export interface HistoryEntry {
  taskId: number;
  taskDate: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  reason: string | null;
  postponeDate: string | null;
  changedAt: string;
}

export interface HistoryInput {
  id?: number;
  recentReasons?: { status: 'postponed' | 'canceled'; limit?: number };
}

export interface HistoryResult {
  history: HistoryEntry[];
  reasons: string[];
}

export interface DaySummary extends StatusCounts {
  date: string;
  total: number;
}

export interface MonthSummary {
  month: string;
  days: DaySummary[];
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface WeeklyStats {
  range: { start: string; end: string };
  totals: StatusCounts & { total: number };
  completionRate: number;
  byDay: (StatusCounts & { date: string })[];
  postponeReasons: ReasonCount[];
  cancelReasons: ReasonCount[];
  repeatedlyPostponed: { title: string; count: number; latestTaskId: number }[];
}

export interface TagSaveInput {
  id?: number;
  name: string;
  color?: string | null;
}

export interface RecurrenceRule {
  id: number;
  title: string;
  memo: string | null;
  priority: Priority;
  ruleType: RuleType;
  weekdays: number[];
  monthDay: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface RecurrenceSaveInput {
  id?: number;
  title: string;
  memo?: string | null;
  priority?: Priority;
  ruleType: RuleType;
  weekdays?: number[];
  monthDay?: number | null;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
}

export interface Settings {
  morningReminderEnabled: boolean;
  morningReminderTime: string;
  taskReminderEnabled: boolean;
}

export interface ExportInput {
  format: 'sqlite' | 'json';
}

export interface ShareInput {
  scope: 'day' | 'week';
  date?: string;
  weekStart?: string;
  format: 'text' | 'image';
  target: 'preview' | 'clipboard' | 'file';
  rect?: { x: number; y: number; width: number; height: number };
}

export interface ShareResult {
  format: 'text' | 'image';
  text: string | null;
  imageDataUrl: string | null;
  path: string | null;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  waiting: '대기',
  in_progress: '진행',
  done: '완료',
  postponed: '연기',
  canceled: '취소',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '높음',
  normal: '보통',
  low: '낮음',
};
