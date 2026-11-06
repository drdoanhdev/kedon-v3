import { useEffect } from 'react';
import { startRecentActivitySyncLoop, stopRecentActivitySyncLoop } from '../lib/recentActivitySync';

/**
 * Background sync for FAB Activity Hub across devices.
 * Mount once under authenticated app shell (when header/nav is shown).
 */
export default function RecentActivitySyncRunner() {
  useEffect(() => {
    startRecentActivitySyncLoop();
    return () => stopRecentActivitySyncLoop();
  }, []);

  return null;
}
