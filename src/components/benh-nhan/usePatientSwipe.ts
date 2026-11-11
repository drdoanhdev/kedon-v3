import { useCallback, useEffect, useRef, useState } from 'react';
import { SWIPE_ACTION_WIDTH_PX } from '@/lib/patient/constants';

export function usePatientSwipe() {
  const [openSwipePatientId, setOpenSwipePatientId] = useState<number | null>(null);
  const [draggingPatientId, setDraggingPatientId] = useState<number | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState<number>(0);
  const touchStartXRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);
  const swipingPatientIdRef = useRef<number | null>(null);
  const swipeBaseOffsetRef = useRef<number>(0);
  const swipeRafRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef<number>(0);

  const scheduleDragOffset = useCallback((offsetPx: number) => {
    pendingDragOffsetRef.current = offsetPx;
    if (swipeRafRef.current !== null) return;

    swipeRafRef.current = window.requestAnimationFrame(() => {
      setDragOffsetPx(pendingDragOffsetRef.current);
      swipeRafRef.current = null;
    });
  }, []);

  const handleSwipeStart = useCallback((patientId: number, e: React.TouchEvent<HTMLDivElement>) => {
    if (openSwipePatientId !== null && openSwipePatientId !== patientId) {
      setOpenSwipePatientId(null);
    }

    swipingPatientIdRef.current = patientId;
    touchStartXRef.current = e.touches[0]?.clientX ?? 0;
    touchCurrentXRef.current = touchStartXRef.current;
    swipeBaseOffsetRef.current = openSwipePatientId === patientId ? -SWIPE_ACTION_WIDTH_PX : 0;
    setDraggingPatientId(patientId);
    setDragOffsetPx(swipeBaseOffsetRef.current);
  }, [openSwipePatientId]);

  const handleSwipeMove = useCallback((patientId: number, e: React.TouchEvent<HTMLDivElement>) => {
    if (swipingPatientIdRef.current !== patientId) return;

    touchCurrentXRef.current = e.touches[0]?.clientX ?? touchStartXRef.current;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    scheduleDragOffset(clampedOffset);
  }, [scheduleDragOffset]);

  const handleSwipeEnd = useCallback((patientId: number) => {
    if (swipingPatientIdRef.current !== patientId) return;

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const rawOffset = swipeBaseOffsetRef.current + deltaX;
    const clampedOffset = Math.max(-SWIPE_ACTION_WIDTH_PX, Math.min(0, rawOffset));
    const shouldOpen = clampedOffset <= -SWIPE_ACTION_WIDTH_PX * 0.35;

    if (shouldOpen) {
      setOpenSwipePatientId(patientId);
    } else {
      setOpenSwipePatientId(null);
    }

    if (swipeRafRef.current !== null) {
      window.cancelAnimationFrame(swipeRafRef.current);
      swipeRafRef.current = null;
    }

    setDraggingPatientId(null);
    setDragOffsetPx(0);
    swipingPatientIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (swipeRafRef.current !== null) {
        window.cancelAnimationFrame(swipeRafRef.current);
      }
    };
  }, []);

  return {
    openSwipePatientId,
    setOpenSwipePatientId,
    draggingPatientId,
    dragOffsetPx,
    handleSwipeStart,
    handleSwipeMove,
    handleSwipeEnd,
    swipeActionWidthPx: SWIPE_ACTION_WIDTH_PX,
  };
}
