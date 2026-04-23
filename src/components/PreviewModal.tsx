import { useEffect } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import type { HopperItem } from '../types/item';

interface Props {
  item: HopperItem;
  onClose: () => void;
}

export default function PreviewModal({ item, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgb(0 0 0 / 0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg border w-full max-w-4xl min-w-[520px] max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--hh-surface-container)',
          borderColor: 'var(--hh-outline-variant)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="px-4 py-2 border-b flex items-center gap-4 text-sm"
          style={{ borderColor: 'var(--hh-outline-variant)' }}
        >
          <span className="font-medium truncate flex-1 min-w-0">{item.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-xs px-2 py-1 rounded border"
            style={{
              color: 'var(--hh-on-surface-muted)',
              borderColor: 'var(--hh-outline-variant)',
            }}
          >
            Close (Esc)
          </button>
        </header>
        <div
          className="flex-1 overflow-auto"
          style={{ backgroundColor: 'var(--hh-surface)' }}
        >
          {item.note && (
            <section
              className="px-5 py-4 border-b"
              style={{ borderColor: 'var(--hh-outline-variant)' }}
            >
              <h3
                className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: 'var(--hh-on-surface-muted)' }}
              >
                Why I saved this
              </h3>
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: 'var(--hh-on-surface)' }}
              >
                {item.note}
              </p>
            </section>
          )}

          <section className="px-5 py-4">
            <h3
              className="text-[10px] font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--hh-on-surface-muted)' }}
            >
              {item.type === 'image'
                ? 'Image'
                : item.type === 'url'
                ? 'URL'
                : item.type === 'file'
                ? 'File'
                : item.type === 'text_snippet'
                ? 'Snippet'
                : 'Note'}
            </h3>
            {item.type === 'image' && item.file_path ? (
              <img
                src={convertFileSrc(item.file_path)}
                alt={item.title}
                className="max-w-full max-h-[65vh] mx-auto block"
              />
            ) : item.type === 'url' && item.content ? (
              <a
                href={item.content}
                className="text-sm font-mono break-all underline"
                style={{ color: 'var(--hh-primary)' }}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.content) invoke('open_external', { target: item.content });
                }}
              >
                {item.content}
              </a>
            ) : item.content ? (
              <pre
                className="whitespace-pre-wrap text-sm font-mono"
                style={{ color: 'var(--hh-on-surface)' }}
              >
                {item.content}
              </pre>
            ) : item.file_path ? (
              <p
                className="text-sm font-mono"
                style={{ color: 'var(--hh-on-surface-muted)' }}
              >
                {item.file_path}
              </p>
            ) : (
              <p
                className="text-sm italic"
                style={{ color: 'var(--hh-on-surface-muted)' }}
              >
                (no content)
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
