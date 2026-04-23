export default function TagChip({ tag }: { tag: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border"
      style={{
        backgroundColor: 'var(--hh-surface-container-high)',
        color: 'var(--hh-on-surface-muted)',
        borderColor: 'var(--hh-outline-variant)',
      }}
    >
      #{tag}
    </span>
  );
}
