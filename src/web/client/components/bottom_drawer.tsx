import { assertEqual } from "@/common/assert";
import { Container } from "@/web/client/components/generic/basics";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import React, {
  useCallback,
  useEffect,
  type CSSProperties,
  type PropsWithChildren,
} from "react";

function eventConsumer<E extends Event>(handler: (e: E) => boolean) {
  return (e: E) => {
    const handled = handler(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
}

/** Exported only for unit tests. */
export function makeOnDrag(
  dragStartLen: React.MutableRefObject<number | undefined>,
  dragStartPos: React.MutableRefObject<number | undefined>,
  setCurrentLen: SetCurrentLenType,
  getMax: () => number,
  minRatio?: number,
  maxRatio?: number,
  reverse?: boolean
) {
  return (currentPos: number) => {
    if (dragStartLen.current === undefined) {
      // We didn't get the start callback yet, so wait for it.
      return false;
    }
    setCurrentLen((oldLen) => {
      if (dragStartPos.current === undefined) {
        dragStartPos.current = currentPos;
      }
      if (dragStartLen.current === undefined) {
        return oldLen;
      }
      const offset = (dragStartPos.current - currentPos) * (reverse ? -1 : 1);
      const proposed = dragStartLen.current + offset;
      const total = getMax();
      const min = total * (minRatio ?? 0);
      const max = total * (maxRatio ?? 1);
      const newLen = proposed > max ? max : proposed < min ? min : proposed;
      const largeChange = Math.abs(oldLen - newLen) >= 6;
      const atBound = newLen === min || newLen === max;
      return atBound || largeChange ? newLen : oldLen;
    });
    return true;
  };
}

type SetCurrentLenType = (callback: (old: number) => number) => unknown;

export function DragHelper(
  props: PropsWithChildren<{
    currentLen: number;
    setCurrentLen: SetCurrentLenType;
    horizontal?: true;
    minRatio?: number;
    maxRatio?: number;
    style?: CSSProperties;
    className?: string;
    reverse?: boolean;
    getMax?: () => number;
  }>
) {
  const {
    currentLen,
    setCurrentLen,
    horizontal,
    minRatio,
    maxRatio,
    reverse,
    getMax,
  } = props;
  const dragStartPos = React.useRef<number | undefined>(undefined);
  const dragStartLen = React.useRef<number | undefined>(undefined);
  const posKey = horizontal ? "clientX" : "clientY";

  const onDrag = React.useMemo(
    () =>
      makeOnDrag(
        dragStartLen,
        dragStartPos,
        setCurrentLen,
        getMax ?? (() => (horizontal ? window.innerWidth : window.innerHeight)),
        minRatio,
        maxRatio,
        reverse
      ),
    [setCurrentLen, horizontal, maxRatio, minRatio, reverse, getMax]
  );

  const onDragEnd = useCallback(() => {
    const result =
      dragStartLen.current !== undefined || dragStartPos.current !== undefined;
    dragStartPos.current = undefined;
    dragStartLen.current = undefined;
    return result;
  }, []);

  useEffect(() => {
    const moveHandler = eventConsumer((e: MouseEvent) => onDrag(e[posKey]));
    document.addEventListener("mousemove", moveHandler);
    const upHandler = eventConsumer((_e: Event) => onDragEnd());
    document.addEventListener("mouseup", upHandler);
    return () => {
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
    };
  }, [onDrag, onDragEnd, posKey]);

  const onDragStart = () => {
    dragStartLen.current = currentLen;
  };

  return (
    <div
      style={{ ...props.style, touchAction: "none" }}
      className={props.className}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onTouchEnd={onDragEnd}
      onTouchMove={(e) => {
        e.preventDefault();
        onDrag(e.targetTouches[0][posKey]);
      }}>
      {props.children}
    </div>
  );
}

function getDefaultHeight() {
  return window.innerHeight * 0.15;
}

export interface BottomDrawerProps {
  drawerHeight: number;
  setDrawerHeight: React.Dispatch<React.SetStateAction<number>>;
  maxRatio?: number;
  drawerContentRef?: React.RefObject<HTMLDivElement>;
  containerClass: string;
}

export function BottomDrawer(
  props: React.PropsWithChildren<BottomDrawerProps>
) {
  const { drawerHeight, setDrawerHeight } = props;
  const children = React.Children.toArray(props.children);
  assertEqual(children.length, 2);

  useEffect(() => {
    const resetDrawer = () => setDrawerHeight(getDefaultHeight());
    window.addEventListener("orientationchange", resetDrawer);
    window.removeEventListener("orientationchange", resetDrawer);
  }, [setDrawerHeight]);

  return (
    <Container
      className={`bgColor ${props.containerClass}`}
      disableGutters
      style={{ position: "fixed", bottom: 0, zIndex: 1 }}>
      <DragHelper
        currentLen={drawerHeight}
        setCurrentLen={setDrawerHeight}
        maxRatio={props.maxRatio}>
        <div>
          <div className="mobileDragger">
            <div className="draggerPuller" />
          </div>
          {children[0]}
        </div>
      </DragHelper>
      <Container
        className="bgColor drawerContainer"
        gutterSize={6}
        innerRef={props.drawerContentRef}
        style={{
          overflowY: "auto",
          height: drawerHeight,
        }}>
        <ContentBox
          isSmall
          styles={{
            marginTop: "0px",
            height: "100%",
            paddingLeft: "6px",
            paddingRight: "6px",
            paddingTop: "2px",
          }}>
          {children[1]}
        </ContentBox>
      </Container>
    </Container>
  );
}
