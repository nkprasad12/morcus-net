import { useRef } from "react";

type TouchData = { p: Position; t: number };
type Position = { x: number; y: number };
/** Exported only for testing. Do not use externally. */
export type TouchEndData = [TouchData, TouchData] | null;

export type SwipeDirection = "Left" | "Right";
export type SwipeListener = (direction: SwipeDirection, size: number) => any;
export interface SwipeListeners {
  onSwipeProgress?: SwipeListener;
  onSwipeCancel?: () => any;
  onSwipeEnd?: SwipeListener;
}

export function GestureListener(
  props: React.PropsWithChildren<{
    className?: string;
    style?: React.CSSProperties;
    listeners?: SwipeListeners;
  }>
) {
  const touchData = useRef<TouchEndData>(null);
  const isSwiping = useRef(false);

  return (
    <div
      onTouchMove={(e) =>
        handleTouchMove(e, touchData, isSwiping, props.listeners)
      }
      onTouchEnd={() => handleTouchEnd(touchData, isSwiping, props.listeners)}>
      {props.children}
    </div>
  );
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
  const swipe = computeSwipeDetails(touchData.current);
  if (swipe) {
    isSwiping.current = true;
    const onProgress = listeners?.onSwipeProgress;
    onProgress && onProgress(swipe[0], swipe[1]);
  } else if (isSwiping.current) {
    isSwiping.current = false;
    const onCancel = listeners?.onSwipeCancel;
    onCancel && onCancel();
  }
}

function computeSwipeDetails(
  data: NonNullable<TouchEndData>
): [SwipeDirection, number] | undefined {
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

  const isHorizontal = maxAbs > minAbs * 2 && absDx > absDy;
  const isFastEnough = speed > 0.1;
  const isLongEnough = relLength > 0.06;
  if (isFastEnough && isHorizontal && isLongEnough) {
    const dir: SwipeDirection = dx > 0 ? "Right" : "Left";
    return [dir, relLength];
  }
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
  const swipe = computeSwipeDetails(data);
  if (swipe) {
    const onSwipe = listeners?.onSwipeEnd;
    onSwipe && onSwipe(swipe?.[0] || "Right", swipe?.[1] || 0);
  } else {
    const onCancel = listeners?.onSwipeCancel;
    onCancel && onCancel();
  }
}
