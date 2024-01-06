import { useRef } from "react";

type TouchData = { p: Position; t: number };
type Position = { x: number; y: number };
/** Exported only for testing. Do not use externally. */
export type TouchEndData = [TouchData, TouchData] | null;

export type SwipeDirection = "Left" | "Right";
export type SwipeListener = (direction: SwipeDirection) => any;

export function GestureListener(
  props: React.PropsWithChildren<{
    className?: string;
    style?: React.CSSProperties;
    onSwipe?: SwipeListener;
  }>
) {
  const touchData = useRef<TouchEndData>(null);
  return (
    <div
      onTouchMove={(e) => handleTouchMove(e, touchData)}
      onTouchEnd={() => handleTouchEnd(touchData, props.onSwipe)}>
      {props.children}
    </div>
  );
}

export function handleTouchMove(
  e: React.TouchEvent<HTMLElement>,
  touchData: React.MutableRefObject<TouchEndData>
) {
  const lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const last = { p: lastPos, t: Date.now() };
  touchData.current = [touchData.current?.[0] || last, last];
}

export function handleTouchEnd(
  touchData: React.MutableRefObject<TouchEndData>,
  onSwipe?: SwipeListener
) {
  const data = touchData.current;
  if (data === null) {
    return;
  }
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
  const isFastEnough = speed > 0.2;
  const isLongEnough = relLength > 0.3;
  if (isFastEnough && isHorizontal && isLongEnough) {
    const dir: SwipeDirection = dx > 0 ? "Right" : "Left";
    onSwipe && onSwipe(dir);
  }
  touchData.current = null;
}
