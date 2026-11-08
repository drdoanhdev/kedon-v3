import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { notifyActivityScopeChanged, setActivityUserId } from '../lib/recentActivity';
import { startRecentActivitySyncLoop, stopRecentActivitySyncLoop } from '../lib/recentActivitySync';

/**
 * Background sync for FAB Activity Hub across devices.
 * Mount once under authenticated app shell (when header/nav is shown).
 * Waits for user + branch scope before relying on boot sync.
 */
export default function RecentActivitySyncRunner() {
  const { user } = useAuth();
  const { currentBranchId } = useBranch();

  useEffect(() => {
    startRecentActivitySyncLoop();
    return () => stopRecentActivitySyncLoop();
  }, []);

  useEffect(() => {
    setActivityUserId(user?.id || null);
  }, [user?.id]);

  // BranchContext already notifies on switch; also re-notify when restored after tenant load.
  useEffect(() => {
    if (!user?.id) return;
    notifyActivityScopeChanged(currentBranchId ? 'branch_ready' : 'branch_cleared');
  }, [user?.id, currentBranchId]);

  return null;
}
