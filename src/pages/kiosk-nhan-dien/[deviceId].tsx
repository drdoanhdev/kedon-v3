'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { Camera, CheckCircle2, Clock, Loader2, UserX } from 'lucide-react';

type KioskState = 'idle' | 'success' | 'already' | 'unknown' | 'error';

interface KioskEvent {
  type: 'check_in' | 'already_in_queue' | 'unknown_face';
  at: string;
  patient_name?: string;
  patient_id?: number;
  queue_id?: number;
  queue_position?: number;
  avatar_url?: string | null;
  pending_id?: number;
  message: string;
}

const DISPLAY_MS = 8000;
const POLL_MS = 2000;

export default function KioskNhanDienPage() {
  const router = useRouter();
  const deviceId = typeof router.query.deviceId === 'string' ? router.query.deviceId : '';
  const token = typeof router.query.token === 'string' ? router.query.token : '';

  const [deviceLabel, setDeviceLabel] = useState('Camera nhận diện');
  const [state, setState] = useState<KioskState>('idle');
  const [event, setEvent] = useState<KioskEvent | null>(null);
  const [clock, setClock] = useState('');
  const [bootError, setBootError] = useState('');
  const [ready, setReady] = useState(false);

  const lastKeyRef = useRef('');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eventKey = useCallback((e: KioskEvent) => {
    return `${e.type}:${e.queue_id || e.pending_id || ''}:${e.at}`;
  }, []);

  const showEvent = useCallback(
    (e: KioskEvent) => {
      const key = eventKey(e);
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;

      setEvent(e);
      if (e.type === 'check_in') setState('success');
      else if (e.type === 'already_in_queue') setState('already');
      else setState('unknown');

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setState('idle');
        setEvent(null);
      }, DISPLAY_MS);
    },
    [eventKey]
  );

  const poll = useCallback(async () => {
    if (!deviceId || !token) return;
    try {
      const { data } = await axios.get(`/api/kiosk/${deviceId}`, {
        params: { token, since_ms: 90000 },
        timeout: 8000,
      });
      setReady(true);
      setBootError('');
      setDeviceLabel(data?.data?.device_label || 'Camera nhận diện');
      const events: KioskEvent[] = data?.data?.events || [];
      if (events.length > 0) {
        showEvent(events[0]);
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setBootError(typeof msg === 'string' ? msg : 'Không kết nối được kiosk');
      setState('error');
    }
  }, [deviceId, token, showEvent]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!deviceId || !token) {
      setBootError('Thiếu mã kiosk. Mở link từ trang Quản lý nhận diện.');
      setState('error');
      return;
    }
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearInterval(t);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [router.isReady, deviceId, token, poll]);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const theme = useMemo(() => {
    switch (state) {
      case 'success':
        return {
          bg: 'from-emerald-600 via-emerald-700 to-teal-900',
          ring: 'ring-emerald-300/40',
        };
      case 'already':
        return {
          bg: 'from-sky-600 via-blue-700 to-indigo-900',
          ring: 'ring-sky-300/40',
        };
      case 'unknown':
        return {
          bg: 'from-amber-600 via-orange-700 to-stone-900',
          ring: 'ring-amber-300/40',
        };
      case 'error':
        return {
          bg: 'from-rose-700 via-red-800 to-stone-900',
          ring: 'ring-rose-300/40',
        };
      default:
        return {
          bg: 'from-slate-800 via-slate-900 to-black',
          ring: 'ring-white/10',
        };
    }
  }, [state]);

  return (
    <div
      className={`min-h-screen w-full bg-gradient-to-br ${theme.bg} text-white flex flex-col items-center justify-center px-6 py-10 select-none`}
    >
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-white/70 text-sm">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          <span>{deviceLabel}</span>
        </div>
        <span className="font-mono tabular-nums">{clock}</span>
      </div>

      <div
        className={`w-full max-w-2xl rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 shadow-2xl ring-1 ${theme.ring} p-8 md:p-12 text-center`}
      >
        {state === 'idle' && (
          <>
            <div className="mx-auto mb-6 w-28 h-28 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
              <Camera className="w-14 h-14 text-white/90" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Vui lòng nhìn vào camera
            </h1>
            <p className="mt-4 text-lg md:text-xl text-white/75">
              Hệ thống sẽ tự động nhận diện và check-in cho bạn
            </p>
            {!ready && !bootError && (
              <p className="mt-8 text-sm text-white/50 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang kết nối...
              </p>
            )}
          </>
        )}

        {(state === 'success' || state === 'already') && event && (
          <>
            <div className="mx-auto mb-6 w-28 h-28 rounded-full overflow-hidden bg-white/20 flex items-center justify-center ring-4 ring-white/30">
              {event.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <CheckCircle2 className="w-16 h-16 text-white" />
              )}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold">
              {event.patient_name ? `Xin chào, ${event.patient_name}` : 'Check-in thành công'}
            </h1>
            <p className="mt-4 text-lg md:text-xl text-white/80">
              {state === 'already'
                ? 'Bạn đã có trong danh sách chờ khám'
                : 'Đã check-in — vui lòng ngồi chờ đến lượt'}
            </p>
            {typeof event.queue_position === 'number' && (
              <div className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-black/25 px-6 py-4">
                <Clock className="w-6 h-6" />
                <div className="text-left">
                  <p className="text-xs uppercase tracking-wider text-white/60">Số thứ tự chờ</p>
                  <p className="text-3xl font-bold tabular-nums">{event.queue_position}</p>
                </div>
              </div>
            )}
          </>
        )}

        {state === 'unknown' && (
          <>
            <div className="mx-auto mb-6 w-28 h-28 rounded-full bg-white/15 flex items-center justify-center">
              <UserX className="w-14 h-14" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Chưa nhận diện được</h1>
            <p className="mt-4 text-lg text-white/80">
              Vui lòng đến quầy lễ tân để đăng ký khuôn mặt hoặc check-in thủ công
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="text-2xl md:text-3xl font-bold">Không mở được kiosk</h1>
            <p className="mt-4 text-white/80">{bootError}</p>
            <p className="mt-2 text-sm text-white/50">
              Tạo lại link kiosk từ trang Quản lý nhận diện → thiết bị camera.
            </p>
          </>
        )}
      </div>

      <p className="mt-10 text-xs text-white/40">Optigo Face Check-in</p>
    </div>
  );
}
