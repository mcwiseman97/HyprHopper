import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const STYLE_ELEMENT_ID = 'omarchy-theme';

function injectCss(css: string) {
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export interface ThemeState {
  name: string | null;
  ready: boolean;
}

/**
 * Fetches the Omarchy-derived CSS on mount, injects it into <head>, and
 * re-injects whenever the Rust watcher fires `theme-changed`.
 */
export function useTheme(): ThemeState {
  const [state, setState] = useState<ThemeState>({ name: null, ready: false });

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    const hydrate = async () => {
      try {
        const [css, name] = await Promise.all([
          invoke<string>('get_theme_css'),
          invoke<string>('get_theme_name'),
        ]);
        if (cancelled) return;
        injectCss(css);
        setState({ name, ready: true });
      } catch (e) {
        console.error('useTheme: initial load failed', e);
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      }
    };

    const subscribe = async () => {
      unlisten = await listen<string>('theme-changed', async (event) => {
        injectCss(event.payload);
        try {
          const name = await invoke<string>('get_theme_name');
          setState({ name, ready: true });
        } catch {
          /* keep old name */
        }
      });
    };

    hydrate();
    subscribe();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return state;
}
