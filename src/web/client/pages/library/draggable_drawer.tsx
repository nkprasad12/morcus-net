import React from "react";
import { useCallback, useEffect, type PropsWithChildren } from "react";

// The maximum size of the drawer as a ratio of the screen height.
export const DRAWER_MAX_SIZE = 0.6;

function eventConsumer<E extends Event>(handler: (e: E) => boolean) {
  return (e: E) => {
    const handled = handler(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
}

export function DragHelper(
  props: PropsWithChildren<{
    currentHeight: number;
    setCurrentHeight: React.Dispatch<React.SetStateAction<number>>;
  }>
) {
  const { currentHeight, setCurrentHeight } = props;
  const dragStartY = React.useRef<number | undefined>(undefined);
  const dragStartHeight = React.useRef<number | undefined>(undefined);

  const onDrag = useCallback(
    (currentY: number) => {
      if (dragStartHeight.current === undefined) {
        // We didn't get the onTouchStart callback yet, so wait for it.
        return false;
      }
      setCurrentHeight((oldHeight) => {
        if (dragStartY.current === undefined) {
          dragStartY.current = currentY;
        }
        if (dragStartHeight.current === undefined) {
          return oldHeight;
        }
        const offset = dragStartY.current - currentY;
        const proposed = dragStartHeight.current + offset;
        const max = window.innerHeight * DRAWER_MAX_SIZE;
        const newHeight = proposed > max ? max : proposed < 0 ? 0 : proposed;
        const largeChange = Math.abs(oldHeight - newHeight) >= 3;
        return newHeight === 0 || largeChange ? newHeight : oldHeight;
      });
      return true;
    },
    [setCurrentHeight]
  );

  const onDragEnd = useCallback(() => {
    const result =
      dragStartHeight.current !== undefined || dragStartY.current !== undefined;
    dragStartY.current = undefined;
    dragStartHeight.current = undefined;
    return result;
  }, []);

  useEffect(() => {
    const moveHandler = eventConsumer((e: MouseEvent) => onDrag(e.clientY));
    document.addEventListener("mousemove", moveHandler);
    const upHandler = eventConsumer((_e: Event) => onDragEnd());
    document.addEventListener("mouseup", upHandler);
    return () => {
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
    };
  }, [onDrag, onDragEnd]);

  const onDragStart = () => {
    dragStartHeight.current = currentHeight;
  };

  return (
    <div
      style={{ touchAction: "none" }}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onTouchEnd={onDragEnd}
      onTouchMove={(e) => onDrag(e.targetTouches[0].clientY)}>
      {props.children}
    </div>
  );
}
