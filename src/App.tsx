import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import Capture from './windows/Capture';
import Feed from './windows/Feed';

/**
 * Each Tauri window loads the same index.html. Which component we render is
 * determined by the window's label — set in tauri.conf.json for the main
 * feed and passed to WebviewWindowBuilder for the capture window.
 */
export default function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLabel(getCurrentWebviewWindow().label);
    } catch {
      setLabel('main'); // browser/dev fallback
    }
  }, []);

  if (label === null) return null;
  if (label === 'capture') return <Capture />;
  return <Feed />;
}
