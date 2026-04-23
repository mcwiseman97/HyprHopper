import type { ItemStatus } from '../types/item';

export default function PriorityBadge({ status }: { status: ItemStatus }) {
  if (status === 'important') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: 'var(--hh-important)',
          color: 'var(--hh-on-important)',
        }}
      >
        Now
      </span>
    );
  }
  if (status === 'dig_deeper') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: 'var(--hh-primary)',
          color: 'var(--hh-on-primary)',
        }}
      >
        Study
      </span>
    );
  }
  if (status === 'reviewed') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide border"
        style={{
          color: 'var(--hh-on-surface-muted)',
          borderColor: 'var(--hh-outline-variant)',
        }}
      >
        Pass
      </span>
    );
  }
  // backlog
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
      style={{
        backgroundColor: 'var(--hh-surface-container-high)',
        color: 'var(--hh-on-surface-muted)',
      }}
    >
      Queue
    </span>
  );
}
