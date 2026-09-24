import { useEffect, useRef, useState } from 'react';

// Element 16 "Ladeanimation", §4: die Animation wird erst nach 200ms
// eingeblendet (schnellere Wechsel zeigen gar nichts), bleibt danach aber
// mindestens 400ms stehen, auch wenn die Daten früher da sind. Ein
// Ladesymbol kann sein eigenes Verschwinden nicht selbst hinauszögern —
// sobald die Aufrufstelle es nicht mehr rendert, entfernt React es sofort.
// Deshalb lebt die Regel hier, in einem Hook, den die Aufrufstelle anstelle
// des rohen "lädt noch"-Zustands abfragt (siehe PROMPT.md §4).
const SHOW_AFTER_MS = 200;
const MIN_VISIBLE_MS = 400;

export function useTipoffLoader(isLoading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(showTimer);
    }

    if (shownAtRef.current === null) {
      setVisible(false);
      return;
    }

    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const hideTimer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(hideTimer);
  }, [isLoading]);

  return visible;
}
