import { PRIORITY_LABELS, STATUS_LABELS, type Priority, type Tag, type TaskStatus } from '@shared/types';

export const PRIORITY_ICON: Record<Priority, string> = { high: '▲', normal: '●', low: '▼' };

export function StatusChip({ status }: { status: TaskStatus }) {
  return <span className={`chip chip--status-${status}`}>{STATUS_LABELS[status]}</span>;
}

interface PriorityChipProps {
  priority: Priority;
  onClick?: () => void;
}

export function PriorityChip({ priority, onClick }: PriorityChipProps) {
  const label = `우선순위 ${PRIORITY_LABELS[priority]}`;
  if (!onClick) {
    return (
      <span className={`priority priority--${priority}`} title={label}>
        {PRIORITY_ICON[priority]}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`priority priority--${priority}`}
      title={`${label} (눌러서 변경)`}
      aria-label={label}
      onClick={onClick}
    >
      {PRIORITY_ICON[priority]}
    </button>
  );
}

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className="chip chip--tag" style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}>
      #{tag.name}
      {onRemove && (
        <button type="button" className="chip__remove" aria-label={`${tag.name} 태그 빼기`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
