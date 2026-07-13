/**
 * Subscribe Supabase Realtime trên ChoKham / PendingFaces.
 * Khi có thay đổi → gọi onRefresh ngay. Giữ polling làm fallback nếu realtime disconnect.
 */
import { useEffect, useRef } from 'react';
import { supabaseAuth } from '../lib/supabaseAuth';

export type FaceRealtimeTable = 'ChoKham' | 'PendingFaces';

interface UseFaceRealtimeRefreshOptions {
  /** Callback làm mới dữ liệu (fetch API hiện có) */
  onRefresh: () => void | Promise<void>;
  /** Bảng cần lắng nghe */
  tables?: FaceRealtimeTable[];
  /** Interval polling fallback (ms). Mặc định 30s — dài hơn trước vì realtime là chính. */
  fallbackPollMs?: number;
  /** Bật/tắt. Mặc định true. */
  enabled?: boolean;
  /** Filter theo cột (vd. device_id=eq.xxx) — optional, áp dụng cho mọi bảng */
  filter?: string;
}

export function useFaceRealtimeRefresh({
  onRefresh,
  tables = ['ChoKham', 'PendingFaces'],
  fallbackPollMs = 30000,
  enabled = true,
  filter,
}: UseFaceRealtimeRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Stabilize array prop to avoid re-subscribing every render
  const tablesKey = tables.join('|');

  useEffect(() => {
    if (!enabled) return;

    const tableList = tablesKey.split('|').filter(Boolean) as FaceRealtimeTable[];
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (disposed) return;
      Promise.resolve(onRefreshRef.current()).catch(() => {});
    };

    const startPoll = (ms: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(refresh, ms);
    };

    startPoll(fallbackPollMs);

    const channelName = `face-rt-${tablesKey}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabaseAuth.channel(channelName);

    for (const table of tableList) {
      const opts: {
        event: '*';
        schema: 'public';
        table: string;
        filter?: string;
      } = {
        event: '*',
        schema: 'public',
        table,
      };
      if (filter) opts.filter = filter;

      channel = channel.on('postgres_changes', opts, () => {
        startPoll(Math.max(fallbackPollMs, 60000));
        refresh();
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        startPoll(Math.max(fallbackPollMs, 60000));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        startPoll(Math.min(fallbackPollMs, 10000));
      }
    });

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      supabaseAuth.removeChannel(channel);
    };
  }, [enabled, fallbackPollMs, filter, tablesKey]);
}
