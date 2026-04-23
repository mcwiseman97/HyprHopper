import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Inbox, Plus, Search } from 'lucide-react';

import ItemCard from '../components/ItemCard';
import PreviewModal from '../components/PreviewModal';
import { useItems } from '../hooks/useItems';
import { useTheme } from '../hooks/useTheme';
import type { HopperItem, ItemStatus } from '../types/item';

type Filter = 'all' | ItemStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'important', label: 'Now' },
  { id: 'dig_deeper', label: 'Study' },
  { id: 'backlog', label: 'Queue' },
  { id: 'reviewed', label: 'Pass' },
];

export default function Feed() {
  const { name: themeName, ready: themeReady } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const { items, loading, error, setStatus, remove } = useItems(filter);
  const [preview, setPreview] = useState<HopperItem | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.note ?? '').toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        (i.content ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--hh-surface)',
        color: 'var(--hh-on-surface)',
      }}
    >
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{
          backgroundColor: 'var(--hh-surface)',
          borderColor: 'var(--hh-outline-variant)',
        }}
      >
        <div className="max-w-5xl mx-auto px-6 pt-5 pb-3 flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight leading-none">HyprHopper</h1>
            <p className="text-[11px] mt-1" style={{ color: 'var(--hh-on-surface-muted)' }}>
              {themeReady && themeName ? (
                <>
                  Theme: <span className="font-mono">{themeName}</span>
                </>
              ) : (
                '…'
              )}
            </p>
          </div>

          <div className="flex-1" />

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded border"
            style={{
              backgroundColor: 'var(--hh-surface-container)',
              borderColor: 'var(--hh-outline-variant)',
            }}
          >
            <Search size={14} style={{ color: 'var(--hh-on-surface-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, note, tags…"
              className="bg-transparent outline-none text-sm w-64"
              style={{ color: 'var(--hh-on-surface)' }}
            />
          </div>

          <button
            type="button"
            onClick={() => invoke('show_capture_window')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border"
            style={{
              backgroundColor: 'var(--hh-primary)',
              color: 'var(--hh-on-primary)',
              borderColor: 'var(--hh-primary)',
            }}
          >
            <Plus size={14} />
            Capture
          </button>
        </div>

        <div className="max-w-5xl mx-auto px-6 pb-3 flex items-center gap-1">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: active ? 'var(--hh-surface-container-high)' : 'transparent',
                  color: active ? 'var(--hh-on-surface)' : 'var(--hh-on-surface-muted)',
                  borderColor: active ? 'var(--hh-outline-variant)' : 'transparent',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-6">
        {error && (
          <div
            className="mb-4 px-3 py-2 rounded text-sm border"
            style={{
              backgroundColor: 'var(--hh-surface-container)',
              color: 'var(--hh-important)',
              borderColor: 'var(--hh-important)',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title="Loading…"
            subtitle="Fetching from SQLite"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title={query ? 'No matches' : filter === 'all' ? 'Nothing captured yet' : 'Empty'}
            subtitle={
              query
                ? 'Try a different search term.'
                : 'Press your capture keybind (or click Capture) to add something.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {visible.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onSetStatus={setStatus}
                onDelete={remove}
                onPreview={setPreview}
              />
            ))}
          </div>
        )}
      </section>

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center py-20">
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
        style={{
          backgroundColor: 'var(--hh-surface-container)',
          color: 'var(--hh-on-surface-muted)',
        }}
      >
        {icon}
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--hh-on-surface-muted)' }}>
        {subtitle}
      </p>
    </div>
  );
}
