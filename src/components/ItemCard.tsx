import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  StickyNote,
  Trash2,
  File as FileIcon,
} from 'lucide-react';

import type { HopperItem, ItemStatus, ItemType } from '../types/item';
import { relativeTime } from '../lib/time';
import PriorityBadge from './PriorityBadge';
import TagChip from './TagChip';

interface Props {
  item: HopperItem;
  onSetStatus: (id: string, status: ItemStatus) => void;
  onDelete: (id: string) => void;
  onPreview: (item: HopperItem) => void;
}

const TYPE_ICON: Record<ItemType, typeof LinkIcon> = {
  url: LinkIcon,
  image: ImageIcon,
  text_snippet: FileText,
  file: FileIcon,
  note: StickyNote,
};

const TYPE_LABEL: Record<ItemType, string> = {
  url: 'URL',
  image: 'Image',
  text_snippet: 'Snippet',
  file: 'File',
  note: 'Note',
};

export default function ItemCard({ item, onSetStatus, onDelete, onPreview }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const Icon = TYPE_ICON[item.type];

  const primaryAction = (() => {
    switch (item.type) {
      case 'url':
        return {
          label: 'Open',
          Icon: ExternalLink,
          run: () => {
            if (item.content) invoke('open_external', { target: item.content });
          },
          disabled: !item.content,
        };
      case 'file':
      case 'image':
        return {
          label: item.type === 'image' ? 'Preview' : 'Open',
          Icon: item.type === 'image' ? Eye : ExternalLink,
          run: () => {
            if (item.type === 'image') onPreview(item);
            else if (item.file_path) invoke('open_external', { target: item.file_path });
          },
          disabled: !item.file_path,
        };
      case 'text_snippet':
      case 'note':
        return {
          label: 'Preview',
          Icon: Eye,
          run: () => onPreview(item),
          disabled: !item.content,
        };
    }
  })();

  return (
    <article
      className="rounded-lg border overflow-hidden flex flex-col h-[175px]"
      style={{
        backgroundColor: 'var(--hh-surface-container)',
        borderColor: 'var(--hh-outline-variant)',
      }}
    >
      <div className="px-4 py-3 flex items-stretch gap-3 flex-1 overflow-hidden">
        <div
          className="flex-shrink-0 rounded w-8 h-8 flex items-center justify-center"
          style={{
            backgroundColor: 'var(--hh-surface-container-high)',
            color: 'var(--hh-on-surface-muted)',
          }}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col h-full">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm leading-snug truncate">{item.title}</h3>
            <PriorityBadge status={item.status} />
          </div>

          {item.note && (
            <p
              className="text-xs mt-1 line-clamp-2"
              style={{ color: 'var(--hh-on-surface-muted)' }}
            >
              {item.note}
            </p>
          )}

          {item.type === 'url' && item.content && (
            <p
              className="text-xs mt-1 font-mono truncate"
              style={{ color: 'var(--hh-on-surface-muted)' }}
            >
              {item.content}
            </p>
          )}

          {(item.type === 'note' || item.type === 'text_snippet') && item.content && (
            <p
              className="text-xs mt-1 line-clamp-2 font-mono"
              style={{ color: 'var(--hh-on-surface-muted)' }}
            >
              {item.content}
            </p>
          )}

          <div
            className="flex items-center gap-2 mt-auto pt-2 text-[11px]"
            style={{ color: 'var(--hh-on-surface-muted)' }}
          >
            <span>{TYPE_LABEL[item.type]}</span>
            <span aria-hidden>·</span>
            <span title={item.created_at}>{relativeTime(item.created_at)}</span>
            {item.tags.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <div className="flex gap-1 flex-wrap">
                  {item.tags.map((t) => (
                    <TagChip key={t} tag={t} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 px-4 py-2 border-t"
        style={{ borderColor: 'var(--hh-outline-variant)' }}
      >
        {primaryAction && (
          <ActionButton
            onClick={primaryAction.run}
            disabled={primaryAction.disabled}
            tone="primary"
            title={primaryAction.label}
          >
            <primaryAction.Icon size={14} />
          </ActionButton>
        )}

        {/* Status transitions: show only the options that aren't the current status. */}
        {item.status !== 'important' && (
          <ActionButton onClick={() => onSetStatus(item.id, 'important')}>Now</ActionButton>
        )}
        {item.status !== 'dig_deeper' && (
          <ActionButton onClick={() => onSetStatus(item.id, 'dig_deeper')}>Study</ActionButton>
        )}
        {item.status !== 'backlog' && (
          <ActionButton onClick={() => onSetStatus(item.id, 'backlog')}>Queue</ActionButton>
        )}
        {item.status !== 'reviewed' && (
          <ActionButton onClick={() => onSetStatus(item.id, 'reviewed')}>Pass</ActionButton>
        )}

        <div className="flex-1" />

        <ActionButton onClick={() => invoke('show_edit_window', { id: item.id })}>
          <Pencil size={13} />
        </ActionButton>

        {confirmingDelete ? (
          <>
            <ActionButton tone="destructive" onClick={() => onDelete(item.id)}>
              <Trash2 size={13} />
              Confirm
            </ActionButton>
            <ActionButton onClick={() => setConfirmingDelete(false)}>Cancel</ActionButton>
          </>
        ) : (
          <ActionButton tone="destructive" onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={13} />
          </ActionButton>
        )}
      </div>
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'destructive';
  title?: string;
}) {
  const bg = tone === 'primary' ? 'var(--hh-primary)' : 'transparent';
  const color =
    tone === 'primary'
      ? 'var(--hh-on-primary)'
      : tone === 'destructive'
      ? 'var(--hh-destructive)'
      : 'var(--hh-on-surface)';
  const border =
    tone === 'primary' ? 'var(--hh-primary)' : 'var(--hh-outline-variant)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: bg, color, borderColor: border }}
    >
      {children}
    </button>
  );
}
