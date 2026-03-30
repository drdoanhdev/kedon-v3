import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { useAuth } from '../contexts/AuthContext';

interface UnreadCounts {
  thongBao: number;
  tinNhan: number;
  total: number;
}

const POLL_INTERVAL_FOCUS = 30_000;   // 30s khi tab đang focus
const POLL_INTERVAL_BLUR = 120_000;   // 2 phút khi tab không focus
const POLL_INTERVAL_IDLE = 0;         // Dừng hẳn khi user idle > 10 phút

/**
 * Hook polling thông minh cho thông báo + tin nhắn.
 * - Focus tab: poll 30s
 * - Blur tab: poll 2 phút
 * - Idle > 10 phút: dừng poll
 * - Tự restart khi user quay lại
 */
export function useNotificationPolling() {
  const { user, currentTenantId } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ thongBao: 0, tinNhan: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(true);
  const lastActivityRef = useRef(Date.now());

  const fetchCounts = useCallback(async () => {
    if (!user || !currentTenantId) {
      setCounts({ thongBao: 0, tinNhan: 0, total: 0 });
      return;
    }

    try {
      setLoading(true);
      const [tbRes, tnRes] = await Promise.all([
        fetchWithAuth('/api/thong-bao?unread_only=true&limit=1'),
        fetchWithAuth('/api/tin-nhan?limit=1'),
      ]);

      let thongBao = 0;
      let tinNhan = 0;

      if (tbRes.ok) {
        const tbData = await tbRes.json();
        thongBao = tbData.unreadCount || 0;
      }
      if (tnRes.ok) {
        const tnData = await tnRes.json();
        tinNhan = tnData.unreadCount || 0;
      }

      setCounts({ thongBao, tinNhan, total: thongBao + tinNhan });
    } catch {
      // Silent fail — sẽ retry lần sau
    } finally {
      setLoading(false);
    }
  }, [user, currentTenantId]);

  // Schedule next poll
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!user || !currentTenantId) return;

    // Idle > 10 phút → dừng
    const idleTime = Date.now() - lastActivityRef.current;
    if (idleTime > 10 * 60 * 1000) return;

    const interval = isFocusedRef.current ? POLL_INTERVAL_FOCUS : POLL_INTERVAL_BLUR;
    timerRef.current = setTimeout(async () => {
      await fetchCounts();
      scheduleNext();
    }, interval);
  }, [user, currentTenantId, fetchCounts]);

  // Visibility + activity tracking
  useEffect(() => {
    const handleVisibility = () => {
      isFocusedRef.current = document.visibilityState === 'visible';
      if (isFocusedRef.current) {
        lastActivityRef.current = Date.now();
        // Fetch ngay khi quay lại tab
        fetchCounts();
        scheduleNext();
      }
    };

    const handleActivity = () => {
      const wasIdle = Date.now() - lastActivityRef.current > 10 * 60 * 1000;
      lastActivityRef.current = Date.now();
      // Restart polling nếu đã idle
      if (wasIdle) {
        fetchCounts();
        scheduleNext();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [fetchCounts, scheduleNext]);

  // Start polling khi user/tenant thay đổi
  useEffect(() => {
    if (user && currentTenantId) {
      fetchCounts();
      scheduleNext();
    } else {
      setCounts({ thongBao: 0, tinNhan: 0, total: 0 });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, currentTenantId, fetchCounts, scheduleNext]);

  // Refresh thủ công (dùng khi vừa đọc xong)
  const refresh = useCallback(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, loading, refresh };
}
