import { useEffect } from 'react';

/**
 * Scrolls the window back to the top whenever `key` changes. Use this on any
 * in-page state that swaps to substantially different content without a
 * route change (list → detail, wizard/flow steps, tab switches) — otherwise
 * the new content can render partially off-screen at the old scroll
 * position. Route changes are already handled separately in App.tsx.
 */
export function useScrollResetOnChange(key: unknown) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);
}
