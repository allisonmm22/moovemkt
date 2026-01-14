import { useState, useRef, useCallback } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

interface SwipeState {
  swiping: boolean;
  direction: 'left' | 'right' | null;
  deltaX: number;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  preventScroll?: boolean;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  preventScroll = false,
}: UseSwipeOptions): [SwipeHandlers, SwipeState] {
  const [state, setState] = useState<SwipeState>({
    swiping: false,
    direction: null,
    deltaX: 0,
  });

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    isHorizontalSwipe.current = null;
    setState({ swiping: true, direction: null, deltaX: 0 });
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;

    const deltaX = e.touches[0].clientX - touchStart.current.x;
    const deltaY = e.touches[0].clientY - touchStart.current.y;

    // Determine if this is a horizontal or vertical swipe on first significant move
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only track horizontal swipes
    if (isHorizontalSwipe.current) {
      if (preventScroll) {
        e.preventDefault();
      }
      
      const direction = deltaX > 0 ? 'right' : 'left';
      setState({ swiping: true, direction, deltaX });
    }
  }, [preventScroll]);

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current || isHorizontalSwipe.current === false) {
      setState({ swiping: false, direction: null, deltaX: 0 });
      touchStart.current = null;
      return;
    }

    const { deltaX } = state;

    if (Math.abs(deltaX) >= threshold) {
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    setState({ swiping: false, direction: null, deltaX: 0 });
    touchStart.current = null;
    isHorizontalSwipe.current = null;
  }, [state.deltaX, threshold, onSwipeLeft, onSwipeRight]);

  return [
    { onTouchStart, onTouchMove, onTouchEnd },
    state,
  ];
}
