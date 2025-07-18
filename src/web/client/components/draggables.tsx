import { assertEqual } from "@/common/assert";
import { Container } from "@/web/client/components/generic/basics";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";
import React, {
  useCallback,
  useEffect,
  useState,
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

export interface BottomDrawerProps {
  drawerHeight: number;
  setDrawerHeight: React.Dispatch<React.SetStateAction<number>>;
  drawerMinimized?: boolean;
  setDrawerMinimized?: React.Dispatch<React.SetStateAction<boolean>>;
  maxRatio?: number;
  defaultHeightRatio?: number;
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
    const resetDrawer = () =>
      // Use the `innerWidth' and not the `innerHeight` because we seem to get
      // the event before the values are swapped.
      setDrawerHeight(window.innerWidth * (props.defaultHeightRatio ?? 0.15));
    window.addEventListener("orientationchange", resetDrawer);
    return () => window.removeEventListener("orientationchange", resetDrawer);
  }, [setDrawerHeight, props.defaultHeightRatio]);

  if (props.drawerMinimized === true) {
    return (
      <IconButton
        onClick={() => props.setDrawerMinimized?.(false)}
        aria-label="Show drawer"
        className="bgAlt drawerOpener">
        <SvgIcon pathD={SvgIcon.MenuOpen} />
      </IconButton>
    );
  }

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
          {props.drawerMinimized === false && (
            <IconButton
              size="small"
              className="menuIcon drawerCloser"
              aria-label="Hide drawer"
              onClick={() => props.setDrawerMinimized?.(true)}>
              <SvgIcon pathD={SvgIcon.Close} />
            </IconButton>
          )}
          {children[0]}
        </div>
      </DragHelper>
      <Container
        className="bgColor drawerContainer"
        gutterSize={6}
        innerRef={props.drawerContentRef}
        style={{
          height: drawerHeight,
        }}>
        {children[1]}
      </Container>
    </Container>
  );
}

// We need to come up a with a better way to deal with this, since
// Experimentally for large screen mode this is 64 but honestly who knows
// about the true range.
const APP_BAR_MAX_HEIGHT = 64;
const COLUMN_TOP_MARGIN = 8;
const COLUMN_BOTTON_MARGIN = 8;
const BASE_COLUMN_STYLE: CSSProperties = {
  height: "100%",
  float: "left",
  boxSizing: "border-box",
};
const COLUMN_STYLE: CSSProperties = {
  ...BASE_COLUMN_STYLE,
  overflow: "auto",
  marginTop: COLUMN_TOP_MARGIN,
  marginBottom: COLUMN_BOTTON_MARGIN,
  scrollPaddingTop: 48,
};
const DRAGGER_SIZE = 24;
const DRAGGER_STYLE: CSSProperties = {
  ...BASE_COLUMN_STYLE,
  width: `${DRAGGER_SIZE}px`,
  marginTop: "16px",
  opacity: "60%",
  cursor: "col-resize",
};

export function ResizingDragger(props: {
  currentLen: number;
  setCurrentLen: (callback: (old: number) => number) => unknown;
  reverse?: boolean;
  minRatio?: number;
  maxRatio?: number;
  getMax?: () => number;
}) {
  return (
    <DragHelper
      currentLen={props.currentLen}
      setCurrentLen={props.setCurrentLen}
      style={DRAGGER_STYLE}
      horizontal
      minRatio={props.minRatio}
      maxRatio={props.maxRatio}
      reverse={props.reverse}
      getMax={props.getMax}>
      <div
        style={{ height: "100%", margin: "auto", width: "4px" }}
        className="bgAlt"
      />
    </DragHelper>
  );
}

export interface ResizeablePanelProps {
  mainRef?: React.RefObject<HTMLDivElement>;
  sideRef?: React.RefObject<HTMLDivElement>;
  mainId?: string;
  sideId?: string;
  mainClass?: string;
  sideClass?: string;
}
export function ResizeablePanels(
  props: PropsWithChildren<ResizeablePanelProps>
) {
  const children = React.Children.toArray(props.children);
  assertEqual(children.length, 2);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const [windowHeight, setWindowHeight] = React.useState(window.innerHeight);
  const windowWidthRef = React.useRef(window.innerWidth);
  const [gutterSize, setGutterSize] = useState<number>(100);
  const [mainWidthPercent, setMainWidthPercent] = useState<number>(56);

  useEffect(() => {
    const onResize = () => {
      setWindowHeight(window.innerHeight);
      const diff = window.innerWidth - windowWidthRef.current;
      windowWidthRef.current = window.innerWidth;
      if (diff < 0) {
        setGutterSize((old) => old + diff / 2);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const containerWidth = React.useCallback(
    () => containerRef.current?.clientWidth ?? window.innerWidth,
    []
  );

  function mainWidth() {
    return (mainWidthPercent * containerWidth()) / 100;
  }

  function setMainWidth(newWidth: number) {
    setMainWidthPercent((newWidth / containerWidth()) * 100);
  }

  return (
    <div
      ref={containerRef}
      style={{
        boxSizing: "border-box",
        display: "block",
        margin: "0 auto",
        width: "100%",
        maxWidth: `calc(100% - ${gutterSize * 2}px`,
        height:
          windowHeight -
          APP_BAR_MAX_HEIGHT -
          COLUMN_TOP_MARGIN -
          COLUMN_BOTTON_MARGIN,
      }}>
      <ResizingDragger
        currentLen={gutterSize}
        reverse
        setCurrentLen={setGutterSize}
        maxRatio={0.3}
      />
      <div
        className={props.mainClass}
        id={props.mainId}
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidthPercent}%`,
        }}>
        {children[0]}
      </div>
      <ResizingDragger
        currentLen={mainWidth()}
        setCurrentLen={(update) => setMainWidth(update(mainWidth()))}
        reverse
        minRatio={0.2}
        maxRatio={0.8}
        getMax={() => containerWidth()}
      />
      <div
        className={props.sideClass}
        id={props.sideId}
        style={{
          ...COLUMN_STYLE,
          width: `calc(${100 - mainWidthPercent}% - ${3 * DRAGGER_SIZE}px)`,
        }}
        ref={props.sideRef}>
        {children[1]}
      </div>
      <ResizingDragger
        currentLen={gutterSize}
        setCurrentLen={setGutterSize}
        maxRatio={0.3}
      />
    </div>
  );
}
