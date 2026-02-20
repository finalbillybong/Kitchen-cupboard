import { useRef, useCallback, useEffect, useState } from 'react';

const THRESHOLD = 80;
const MAX_PULL = 130;

export function usePullToRefresh(onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    if (window.scrollY > 0) {
      startY.current = null;
      setPulling(false);
      setPullDistance(0);
      return;
    }

    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) {
      startY.current = null;
      return;
    }

    // Dampen the pull with a decaying curve
    const dampened = Math.min(dy * 0.45, MAX_PULL);
    setPulling(true);
    setPullDistance(dampened);

    if (dampened > 10) {
      e.preventDefault();
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (startY.current === null && !pulling) return;
    startY.current = null;

    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPulling(false);
        setPullDistance(0);
      }
    } else {
      setPulling(false);
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh, pulling]);

  useEffect(() => {
    const el = containerRef.current || document;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const triggered = pullDistance >= THRESHOLD;

  return { containerRef, pulling: pulling || refreshing, pullDistance, refreshing, triggered };
}
