import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Khoảng scroll (px) để header đi từ mở hết → thu gọn hết. */
const DEFAULT_TRAVEL_PX = 112;

/**
 * Thu gọn header bệnh nhân theo scrollTop của panel đang mở.
 * Không chặn touch / không hấp thụ gesture — tránh lỗi cuộn cả khối header.
 */
export function useMobileHeaderCollapse(
  scrollRootRef: RefObject<HTMLElement | null>,
  activePanelIdx: number,
  travelPx: number = DEFAULT_TRAVEL_PX,
): number {
  const [ratio, setRatio] = useState(0);
  const ratioRef = useRef(0);
  const activeIdxRef = useRef(activePanelIdx);
  activeIdxRef.current = activePanelIdx;

  const syncFromPanel = useCallback((panel: HTMLElement | null) => {
    const next = panel ? Math.min(1, Math.max(0, panel.scrollTop / travelPx)) : 0;
    if (Math.abs(next - ratioRef.current) < 0.008) return;
    ratioRef.current = next;
    setRatio(next);
  }, [travelPx]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const idxAttr = el.getAttribute('data-panel-idx');
      if (idxAttr === null || Number(idxAttr) !== activeIdxRef.current) return;
      syncFromPanel(el);
    };

    root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => root.removeEventListener('scroll', onScroll, true);
  }, [scrollRootRef, syncFromPanel]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const panel = root.querySelector<HTMLElement>(`[data-panel-idx="${activePanelIdx}"]`);
    syncFromPanel(panel);
  }, [activePanelIdx, scrollRootRef, syncFromPanel]);

  return ratio;
}
