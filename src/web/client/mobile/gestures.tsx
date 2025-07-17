import { singletonOf } from "@/common/misc_utils";
import { useEffect, useMemo, useRef } from "react";

export const MIN_SWIPE_SIZE = 0.04;
type TouchData = { p: Position; t: number };
type Position = { x: number; y: number };
/** Exported only for testing. Do not use externally. */
export type TouchEndData = [TouchData, TouchData] | null;

export type SwipeDirection = "Left" | "Right";
export type SwipeListener = (
  direction: SwipeDirection,
  size: number
) => unknown;
export interface SwipeListeners {
  onSwipeProgress?: SwipeListener;
  onSwipeCancel?: () => unknown;
  onSwipeEnd?: SwipeListener;
}
type GestureCallbacks = {
  onTouchMove: React.TouchEventHandler<HTMLElement>;
  onTouchEnd: React.TouchEventHandler<HTMLElement>;
};
export function useGestureListener(
  listeners?: SwipeListeners
): GestureCallbacks {
  const touchData = useRef<TouchEndData>(null);
  const isSwiping = useRef(false);

  return {
    onTouchMove: (e) => handleTouchMove(e, touchData, isSwiping, listeners),
    onTouchEnd: () => handleTouchEnd(touchData, isSwiping, listeners),
  };
}

export function handleTouchMove(
  e: React.TouchEvent<HTMLElement>,
  touchData: React.MutableRefObject<TouchEndData>,
  isSwiping: React.MutableRefObject<boolean>,
  listeners?: SwipeListeners
) {
  const lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const last = { p: lastPos, t: Date.now() };
  touchData.current = [touchData.current?.[0] || last, last];
  const [swipeDir, size] = computeSwipeDetails(touchData.current);
  if (swipeDir) {
    isSwiping.current = true;
    const onProgress = listeners?.onSwipeProgress;
    onProgress?.(swipeDir, size);
  } else if (isSwiping.current) {
    isSwiping.current = false;
    const onCancel = listeners?.onSwipeCancel;
    onCancel?.();
  }
}

function computeSwipeDetails(
  data: NonNullable<TouchEndData>
): [SwipeDirection | undefined, number] {
  const dx = data[1].p.x - data[0].p.x;
  // The origin is the bottom left corner.
  const dy = data[0].p.y - data[1].p.y;
  const dt = data[1].t - data[0].t;
  const dl = Math.sqrt(dx * dx + dy * dy);

  const speed = dl / dt;
  const relLength = dl / Math.min(window.innerWidth, window.innerHeight);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const maxAbs = Math.max(absDx, absDy);
  const minAbs = Math.min(absDx, absDy);

  const isHorizontal = maxAbs > minAbs * 1.5 && absDx > absDy;
  const isFastEnough = speed > 0.07;
  const isLongEnough = relLength > MIN_SWIPE_SIZE;
  let dir: SwipeDirection | undefined = undefined;
  if (isFastEnough && isHorizontal && isLongEnough) {
    dir = dx > 0 ? "Right" : "Left";
  }
  return [dir, relLength];
}

export function handleTouchEnd(
  touchData: React.MutableRefObject<TouchEndData>,
  isSwipingRef: React.MutableRefObject<boolean>,
  listeners?: SwipeListeners
) {
  const data = touchData.current;
  const isSwiping = isSwipingRef.current;
  isSwipingRef.current = false;
  touchData.current = null;
  if (data === null || !isSwiping) {
    return;
  }
  const [swipeDir, size] = computeSwipeDetails(data);
  if (swipeDir) {
    const onSwipe = listeners?.onSwipeEnd;
    onSwipe?.(swipeDir, size);
  } else {
    const onCancel = listeners?.onSwipeCancel;
    onCancel?.();
  }
}

const GLOBAL_GESTURE_LISTENERS = singletonOf<Set<SwipeListeners>>(
  () => new Set()
);

export function useSwipeListener(listeners: SwipeListeners) {
  useEffect(() => {
    const allListeners = GLOBAL_GESTURE_LISTENERS.get();
    if (allListeners.has(listeners)) {
      return;
    }
    allListeners.add(listeners);
    return () => {
      allListeners.delete(listeners);
    };
  }, [listeners]);
}

export function SwipeGestureListener(props: React.PropsWithChildren<object>) {
  const swipeListener: SwipeListeners = useMemo(() => {
    return {
      onSwipeEnd: (direction, size) => {
        GLOBAL_GESTURE_LISTENERS.get().forEach((l) =>
          l.onSwipeEnd?.(direction, size)
        );
      },
      onSwipeCancel: () => {
        GLOBAL_GESTURE_LISTENERS.get().forEach((l) => l.onSwipeCancel?.());
      },
      onSwipeProgress: (direction, size) => {
        GLOBAL_GESTURE_LISTENERS.get().forEach((l) =>
          l.onSwipeProgress?.(direction, size)
        );
      },
    };
  }, []);

  const listeners = useGestureListener(swipeListener);

  return <div {...listeners}>{props.children}</div>;
}
