import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { HopperItem, ItemStatus } from '../types/item';

export interface UseItemsState {
  items: HopperItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setStatus: (id: string, status: ItemStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Fetches items, keeps them fresh via `items-changed` events from the Rust side,
 * and exposes optimistic mutations. Mutations update local state immediately,
 * call into the DB, and roll back on failure.
 */
export function useItems(filter: ItemStatus | 'all'): UseItemsState {
  const [items, setItems] = useState<HopperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestFilter = useRef(filter);
  latestFilter.current = filter;

  const fetchItems = useCallback(async () => {
    try {
      setError(null);
      const fetched = await invoke<HopperItem[]>('get_items', {
        filter: latestFilter.current === 'all' ? null : latestFilter.current,
      });
      setItems(fetched);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [filter, fetchItems]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      unlisten = await listen('items-changed', () => {
        fetchItems();
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [fetchItems]);

  const setStatus = useCallback(
    async (id: string, status: ItemStatus) => {
      const snapshot = items;
      // Optimistic: if an item's new status is filtered out of the current view,
      // remove it from the list; otherwise patch in place. Let the event-driven
      // refetch reconcile ordering.
      setItems((prev) => {
        const updated = prev
          .map((i) => (i.id === id ? { ...i, status } : i))
          .filter((i) => latestFilter.current === 'all' || i.status === latestFilter.current);
        return updated;
      });
      try {
        await invoke('update_item_status', { id, status });
      } catch (e) {
        console.error('setStatus failed, rolling back', e);
        setItems(snapshot);
        setError(String(e));
      }
    },
    [items],
  );

  const remove = useCallback(
    async (id: string) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await invoke('delete_item', { id });
      } catch (e) {
        console.error('remove failed, rolling back', e);
        setItems(snapshot);
        setError(String(e));
      }
    },
    [items],
  );

  return { items, loading, error, refetch: fetchItems, setStatus, remove };
}
