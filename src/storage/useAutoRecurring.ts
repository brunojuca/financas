import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db } from './db';
import { generateDueRecurring } from './repo';

/**
 * Stores recurring entries as their dates arrive: on open, whenever templates change and when the app
 * comes back to the foreground (the date may have changed meanwhile).
 */
export function useAutoRecurring(enabled: boolean): void {
  const templates = useLiveQuery(() => (enabled ? db.recurring.toArray() : []), [enabled]);
  useEffect(() => {
    if (!enabled || templates === undefined) return;
    void generateDueRecurring();
  }, [enabled, templates]);
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void generateDueRecurring();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);
}
