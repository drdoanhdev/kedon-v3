import { useEffect, useState } from 'react';

/** Ẩn bottom bar khi bàn phím ảo mở (có điều chỉnh pinch-zoom). */
export function useKeyboardOpen(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      const scale = vv.scale || 1;
      const heightDiff = window.innerHeight - vv.height * scale;
      setKeyboardOpen(heightDiff > 150);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return keyboardOpen;
}
