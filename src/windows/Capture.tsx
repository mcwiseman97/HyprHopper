import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readText as clipboardReadText } from '@tauri-apps/plugin-clipboard-manager';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen, X } from 'lucide-react';

import { useTheme } from '../hooks/useTheme';
import type { ItemType, ItemStatus, NewItem, HopperItem } from '../types/item';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

const TYPES: { value: ItemType; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'text_snippet', label: 'Text Snippet' },
  { value: 'note', label: 'Note' },
  { value: 'image', label: 'Image' },
  { value: 'file', label: 'File' },
];

function detectTypeFromClipboard(text: string): { type: ItemType; content: string; titleGuess: string } {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed) && !trimmed.includes('\n')) {
    let titleGuess = trimmed;
    try {
      const u = new URL(trimmed);
      titleGuess = u.hostname + u.pathname.replace(/\/$/, '');
    } catch {
      /* keep raw */
    }
    return { type: 'url', content: trimmed, titleGuess };
  }
  if (trimmed.includes('\n')) {
    const firstLine = trimmed.split('\n', 1)[0].slice(0, 80);
    return { type: 'text_snippet', content: trimmed, titleGuess: firstLine };
  }
  return { type: 'note', content: '', titleGuess: '' };
}

export default function Capture() {
  useTheme(); // apply theme to this window

  const editId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('edit');
    } catch {
      return null;
    }
  }, []);
  const isEdit = editId !== null;

  const [type, setType] = useState<ItemType>('note');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<ItemStatus>('backlog');
  const [existingItem, setExistingItem] = useState<HopperItem | null>(null);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // Hydrate: in edit mode fetch the item; otherwise read clipboard. Always load tag suggestions.
  useEffect(() => {
    (async () => {
      try {
        if (isEdit && editId) {
          const item = await invoke<HopperItem | null>('get_item', { id: editId });
          if (item) {
            setExistingItem(item);
            setType(item.type);
            setTitle(item.title);
            setNote(item.note ?? '');
            setContent(item.content ?? '');
            setFilePath(item.file_path ?? null);
            setTags(item.tags);
            setStatus(item.status === 'reviewed' ? 'backlog' : item.status);
          } else {
            setError('Item not found');
          }
        } else {
          const clip = await clipboardReadText().catch(() => null);
          if (clip) {
            const detected = detectTypeFromClipboard(clip);
            setType(detected.type);
            setContent(detected.content);
            setTitle(detected.titleGuess);
          }
        }
        const tagsResp = await invoke<string[]>('get_all_tags');
        setExistingTags(tagsResp);
      } catch (e) {
        console.warn('capture hydrate failed', e);
      }
      setTimeout(() => titleRef.current?.focus(), 0);
    })();
  }, [isEdit, editId]);

  // Escape closes without saving.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        invoke('close_capture_window').catch(console.error);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return existingTags.filter((t) => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 6);
  }, [tagInput, existingTags, tags]);

  function addTag(t: string) {
    const v = t.trim();
    if (!v) return;
    if (tags.includes(v)) return;
    setTags([...tags, v]);
    setTagInput('');
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  }

  async function pickFile() {
    try {
      const filters =
        type === 'image'
          ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }, { name: 'All files', extensions: ['*'] }]
          : undefined;
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        filters,
      });
      if (typeof selected !== 'string') return;
      setFilePath(selected);
      // Auto-fill title from filename if user hasn't typed anything yet.
      if (!title.trim()) {
        const name = basename(selected).replace(/\.[^.]+$/, '');
        setTitle(name);
      }
    } catch (e) {
      console.warn('file picker failed', e);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      titleRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && existingItem) {
        const updated: HopperItem = {
          ...existingItem,
          title: title.trim(),
          note: note.trim() || undefined,
          type,
          content: content.trim() || undefined,
          file_path: filePath ?? undefined,
          tags,
          status,
        };
        await invoke('update_item', { item: updated });
      } else {
        const payload: NewItem = {
          title: title.trim(),
          note: note.trim() || null,
          type,
          content: content.trim() || null,
          file_path: filePath,
          tags,
          status,
        };
        const saved = await invoke<HopperItem>('create_item', { item: payload });
        await invoke('notify_saved', { title: saved.title }).catch(console.warn);
      }
      await invoke('close_capture_window');
    } catch (err) {
      console.error(err);
      setError(String(err));
      setSubmitting(false);
    }
  }

  const needsContent = type === 'url' || type === 'text_snippet' || type === 'note';
  const needsFilePath = type === 'image' || type === 'file';

  return (
    <form
      onSubmit={onSubmit}
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--hh-surface)',
        color: 'var(--hh-on-surface)',
      }}
    >
      <header
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--hh-outline-variant)' }}
      >
        <h1 className="text-sm font-medium tracking-tight">{isEdit ? 'Edit item' : 'Capture to HyprHopper'}</h1>
        <span className="text-xs font-mono" style={{ color: 'var(--hh-on-surface-muted)' }}>
          Esc to cancel · ⌘↵ to save
        </span>
      </header>

      <div className="flex-1 p-5 space-y-4">
        {/* Type selector */}
        <div className="flex gap-1 flex-wrap">
          {TYPES.map((t) => {
            const active = t.value === type;
            return (
              <button
                type="button"
                key={t.value}
                onClick={() => setType(t.value)}
                className="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: active ? 'var(--hh-primary)' : 'transparent',
                  color: active ? 'var(--hh-on-primary)' : 'var(--hh-on-surface)',
                  borderColor: active ? 'var(--hh-primary)' : 'var(--hh-outline-variant)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <Field label="Title" required>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this?"
            className="w-full px-3 py-2 rounded border bg-transparent outline-none"
            style={{
              borderColor: 'var(--hh-outline-variant)',
              color: 'var(--hh-on-surface)',
            }}
          />
        </Field>

        {/* Content (URL / text snippet / note body) */}
        {needsContent && (
          <Field label={type === 'url' ? 'URL' : type === 'text_snippet' ? 'Snippet' : 'Note'}>
            {type === 'url' ? (
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded border bg-transparent outline-none font-mono text-sm"
                style={{
                  borderColor: 'var(--hh-outline-variant)',
                  color: 'var(--hh-on-surface)',
                }}
              />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={type === 'note' ? 'Write a note…' : 'Paste text…'}
                rows={4}
                className="w-full px-3 py-2 rounded border bg-transparent outline-none resize-y"
                style={{
                  borderColor: 'var(--hh-outline-variant)',
                  color: 'var(--hh-on-surface)',
                }}
              />
            )}
          </Field>
        )}

        {needsFilePath && (
          <Field label={type === 'image' ? 'Image file' : 'File'}>
            {filePath ? (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded border"
                style={{
                  borderColor: 'var(--hh-outline-variant)',
                  backgroundColor: 'var(--hh-surface-container)',
                }}
              >
                <FolderOpen size={14} style={{ color: 'var(--hh-on-surface-muted)' }} />
                <span
                  className="flex-1 font-mono text-sm truncate"
                  title={filePath}
                  style={{ color: 'var(--hh-on-surface)' }}
                >
                  {basename(filePath)}
                </span>
                <button
                  type="button"
                  onClick={() => pickFile()}
                  className="px-2 py-0.5 rounded text-[11px] border"
                  style={{
                    color: 'var(--hh-on-surface-muted)',
                    borderColor: 'var(--hh-outline-variant)',
                  }}
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => setFilePath(null)}
                  title="Clear"
                  className="p-1 rounded"
                  style={{ color: 'var(--hh-on-surface-muted)' }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pickFile()}
                className="w-full px-3 py-2 rounded border flex items-center gap-2 text-sm bg-transparent"
                style={{
                  borderColor: 'var(--hh-outline-variant)',
                  color: 'var(--hh-on-surface-muted)',
                }}
              >
                <FolderOpen size={14} />
                {type === 'image' ? 'Choose an image…' : 'Choose a file…'}
              </button>
            )}
          </Field>
        )}

        {/* Why */}
        <Field label="Why are you saving this?" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="(optional)"
            rows={2}
            className="w-full px-3 py-2 rounded border bg-transparent outline-none resize-y"
            style={{
              borderColor: 'var(--hh-outline-variant)',
              color: 'var(--hh-on-surface)',
            }}
          />
        </Field>

        {/* Tags */}
        <Field label="Tags" optional>
          <div
            className="rounded border px-2 py-1.5 flex flex-wrap gap-1.5 items-center"
            style={{ borderColor: 'var(--hh-outline-variant)' }}
          >
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => removeTag(t)}
                className="px-2 py-0.5 rounded text-xs font-medium border flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--hh-surface-container)',
                  borderColor: 'var(--hh-outline-variant)',
                  color: 'var(--hh-on-surface)',
                }}
                title="Click to remove"
              >
                {t}
                <span aria-hidden style={{ color: 'var(--hh-on-surface-muted)' }}>
                  ×
                </span>
              </button>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              placeholder={tags.length ? '' : 'type and Enter to add…'}
              className="flex-1 min-w-[8ch] bg-transparent outline-none text-sm px-1"
              style={{ color: 'var(--hh-on-surface)' }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTag(s)}
                  className="px-2 py-0.5 rounded text-xs border"
                  style={{
                    color: 'var(--hh-on-surface-muted)',
                    borderColor: 'var(--hh-outline-variant)',
                    backgroundColor: 'transparent',
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Priority */}
        <Field label="Priority">
          <div className="flex gap-2">
            <PrioBtn active={status === 'backlog'} onClick={() => setStatus('backlog')} label="Queue" />
            <PrioBtn active={status === 'dig_deeper'} onClick={() => setStatus('dig_deeper')} label="Study" />
            <PrioBtn active={status === 'important'} onClick={() => setStatus('important')} label="Now" tone="important" />
          </div>
        </Field>

        {error && (
          <div
            className="px-3 py-2 rounded text-sm border"
            style={{
              backgroundColor: 'var(--hh-surface-container)',
              color: 'var(--hh-important)',
              borderColor: 'var(--hh-important)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      <footer
        className="px-5 py-3 border-t flex justify-end gap-2"
        style={{ borderColor: 'var(--hh-outline-variant)' }}
      >
        <button
          type="button"
          onClick={() => invoke('close_capture_window')}
          className="px-3 py-1.5 rounded text-sm border bg-transparent"
          style={{
            color: 'var(--hh-on-surface)',
            borderColor: 'var(--hh-outline)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 rounded text-sm font-medium border disabled:opacity-60"
          style={{
            backgroundColor: 'var(--hh-primary)',
            color: 'var(--hh-on-primary)',
            borderColor: 'var(--hh-primary)',
          }}
        >
          {submitting ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
      </footer>
    </form>
  );
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--hh-on-surface-muted)' }}>
          {label}
          {required && <span style={{ color: 'var(--hh-important)' }}> *</span>}
        </span>
        {optional && (
          <span className="text-[10px] uppercase" style={{ color: 'var(--hh-on-surface-muted)' }}>
            optional
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

function PrioBtn({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: 'important';
}) {
  const bg = active ? (tone === 'important' ? 'var(--hh-important)' : 'var(--hh-primary)') : 'transparent';
  const color = active
    ? tone === 'important'
      ? 'var(--hh-on-important)'
      : 'var(--hh-on-primary)'
    : 'var(--hh-on-surface)';
  const border = active
    ? tone === 'important'
      ? 'var(--hh-important)'
      : 'var(--hh-primary)'
    : 'var(--hh-outline-variant)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded text-sm border transition-colors"
      style={{ backgroundColor: bg, color, borderColor: border }}
    >
      {label}
    </button>
  );
}
