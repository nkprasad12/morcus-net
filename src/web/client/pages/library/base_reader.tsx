import { assert } from "@/common/assert";
import { Container } from "@/web/client/components/generic/basics";
import { usePersistedState } from "@/web/client/utils/hooks/persisted_state";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
  isDefaultSidebarTab,
} from "@/web/client/pages/library/reader_sidebar_components";
import React, {
  CSSProperties,
  PropsWithChildren,
  useEffect,
  useState,
  useCallback,
} from "react";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { Footer } from "@/web/client/components/footer";
import {
  SwipeListener,
  SwipeListeners,
  useGestureListener,
} from "@/web/client/mobile/gestures";
import { useWakeLock } from "@/web/client/mobile/wake_lock";
import { useMediaQuery } from "@/web/client/utils/media_query";

export const SWIPE_NAV_KEY = "RD_MB_NAV_SWIPE";
export const TAP_NAV_KEY = "RD_MB_NAV_SIDE_TAP";

// This internal logic is currently being used in `reader.tsx` to determine
// whether we are using a two column or one column layout for purposes of scroll.
export const LARGE_VIEW_MAIN_COLUMN_ID = "readerMainColumn";

type SidebarTab<T> = T | DefaultSidebarTab;
interface Responsive {
  isMobile: boolean;
}

/** Configuration for the sidebar or drawer */
interface SidebarConfig<CustomTabs> {
  initialSidebarTab?: SidebarTab<CustomTabs>;
  sidebarTabConfigs?: ReaderInternalTabConfig<SidebarTab<CustomTabs>>[];
  dictActionMessage?: string;
  showMobileNavSettings?: boolean;
}
/** Configuration for extra tabs to add to the sidebar or drawer. */
export interface BaseExtraSidebarTabProps<CustomSidebarTab> {
  tab: CustomSidebarTab;
}
/** Properties for the main column. */
export interface BaseMainColumnProps extends Responsive {
  onWordSelected: (word: string) => unknown;
}
interface ReaderExternalLayoutProps {
  swipeListeners?: SwipeListeners;
  swipeNavigation?: boolean;
  tapNavigation?: boolean;
}
export interface BaseReaderProps<
  CustomSidebarTab,
  MainColumnProps,
  SidebarProps
> extends ReaderExternalLayoutProps {
  MainColumn: React.ComponentType<MainColumnProps & BaseMainColumnProps>;
  ExtraSidebarContent?: React.ComponentType<
    BaseExtraSidebarTabProps<CustomSidebarTab> & SidebarProps
  >;
}
export function BaseReader<
  MainColumnProps = object,
  CustomSidebarTab extends string = never,
  SidebarProps = object
>(
  props: BaseReaderProps<CustomSidebarTab, MainColumnProps, SidebarProps> &
    MainColumnProps &
    SidebarProps &
    SidebarConfig<CustomSidebarTab>
) {
  const [sidebarTab, setSidebarTab] = React.useState<
    SidebarTab<CustomSidebarTab>
  >(props.initialSidebarTab || "Dictionary");
  const [dictWord, setDictWord] = React.useState<string | undefined>(undefined);
  const [swipeNavigation, setSwipeNavigation] = usePersistedState<boolean>(
    true,
    SWIPE_NAV_KEY
  );
  const [tapNavigation, setTapNavigation] = usePersistedState<boolean>(
    false,
    TAP_NAV_KEY
  );
  const [drawerHeight, setDrawerHeight] = useState<number>(
    window.innerHeight * 0.15
  );

  useEffect(() => {
    const resetDrawer = () => setDrawerHeight(window.innerHeight * 0.15);
    window.addEventListener("orientationchange", resetDrawer);
    window.removeEventListener("orientationchange", resetDrawer);
  }, [setDrawerHeight]);

  const isScreenSmall = useMediaQuery("(max-width: 900px)");
  const BaseLayout = isScreenSmall ? BaseMobileReaderLayout : BaseReaderLayout;

  const sidebarRef = React.useRef<HTMLDivElement>(null);

  const showDefaultTab = isDefaultSidebarTab(sidebarTab);
  const hasCustomTabs = props.ExtraSidebarContent !== undefined;
  const hasCustomTabConfigs = props.sidebarTabConfigs !== undefined;
  assert(
    !hasCustomTabs || hasCustomTabConfigs,
    "Without `sidebarTabConfigs`, the `BaseReader` won't surface navigation icons for custom tabs."
  );

  const { swipeListeners } = props;

  const onDictWord = useCallback(
    (word: string) => {
      setDictWord(word);
      setDrawerHeight((height) => {
        const minHeight = window.innerHeight * 0.15;
        const increaseSize = isScreenSmall && height < minHeight;
        return increaseSize ? minHeight : height;
      });
    },
    [isScreenSmall]
  );

  const extendWakeLock = useWakeLock();

  const onWordSelected = useCallback(
    (word: string) => {
      sidebarRef.current?.scroll({ top: 0, behavior: "instant" });
      setSidebarTab("Dictionary");
      onDictWord(word);
    },
    [onDictWord]
  );

  useEffect(
    () => extendWakeLock && extendWakeLock(),
    [extendWakeLock, dictWord, drawerHeight, sidebarTab]
  );

  return (
    <BaseLayout
      sidebarRef={sidebarRef}
      drawerHeight={drawerHeight}
      setDrawerHeight={setDrawerHeight}
      swipeNavigation={swipeNavigation}
      tapNavigation={tapNavigation}
      swipeListeners={swipeListeners}>
      <props.MainColumn
        {...props}
        onWordSelected={onWordSelected}
        isMobile={isScreenSmall}
      />
      <ReaderInternalNavbar
        currentTab={sidebarTab}
        setCurrentTab={setSidebarTab}
        tabs={props.sidebarTabConfigs || DEFAULT_SIDEBAR_TAB_CONFIGS}
        location={isScreenSmall ? "Drawer" : undefined}
      />
      {showDefaultTab ? (
        <DefaultReaderSidebarContent
          isSmallScreen={isScreenSmall}
          {...(isScreenSmall && props.showMobileNavSettings
            ? {
                swipeNavigation,
                setSwipeNavigation,
                tapNavigation,
                setTapNavigation,
              }
            : {})}
          currentTab={sidebarTab}
          setCurrentTab={setSidebarTab}
          dictWord={dictWord}
          setDictWord={onDictWord}
          dictActionMessage={props.dictActionMessage}
        />
      ) : props.ExtraSidebarContent === undefined ? (
        <></>
      ) : (
        <props.ExtraSidebarContent {...props} tab={sidebarTab} />
      )}
    </BaseLayout>
  );
}

// The maximum size of the drawer as a ratio of the screen height.
const DRAWER_MAX_SIZE = 0.6;

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

function DragHelper(
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

  const onDragStart = (e: { preventDefault: () => void }) => {
    dragStartLen.current = currentLen;
    e.preventDefault();
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

/** Exported only for testing. Do not use externally. */
export function handleSideTap(
  e: { clientX: number },
  listener?: SwipeListener
) {
  const position = e.clientX / window.innerWidth;
  const edgeDistance = Math.min(position, Math.abs(1 - position));
  if (edgeDistance < 0.075 && listener) {
    const direction = position < 0.5 ? "Right" : "Left";
    listener(direction, 1);
  }
}

interface MobileReaderLayoutProps
  extends BaseReaderLayoutProps,
    ReaderExternalLayoutProps {
  drawerHeight: number;
  setDrawerHeight: React.Dispatch<React.SetStateAction<number>>;
}

export function BaseMobileReaderLayout(props: MobileReaderLayoutProps) {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const { sidebarRef, drawerHeight, setDrawerHeight } = props;
  const listeners = useGestureListener(props.swipeListeners);

  return (
    <div>
      <Container className="readerMain" disableGutters>
        <div
          {...(props.swipeNavigation ? listeners : {})}
          onClick={
            props.tapNavigation === true
              ? (e) => handleSideTap(e, props.swipeListeners?.onSwipeEnd)
              : undefined
          }>
          {mainContent}
          <Footer marginRatio={DRAWER_MAX_SIZE} />
        </div>
      </Container>
      <Container
        className="readerSide bgColor"
        disableGutters
        style={{ position: "fixed", bottom: 0, zIndex: 1 }}>
        <DragHelper
          currentLen={drawerHeight}
          setCurrentLen={setDrawerHeight}
          maxRatio={DRAWER_MAX_SIZE}>
          <div>
            <div className="readerMobileDragger">
              <div className="draggerPuller" />
            </div>
            {sidebarBar}
          </div>
        </DragHelper>
        <Container
          className="bgColor readerDrawerContainer"
          gutterSize={6}
          innerRef={sidebarRef}
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
            {sidebarContent}
          </ContentBox>
        </Container>
      </Container>
    </div>
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
  scrollPaddingTop: APP_BAR_MAX_HEIGHT,
};
const DRAGGER_SIZE = 24;
const DRAGGER_STYLE: CSSProperties = {
  ...BASE_COLUMN_STYLE,
  width: `${DRAGGER_SIZE}px`,
  marginTop: "16px",
  opacity: "60%",
  cursor: "col-resize",
};

function ResizingDragger(props: {
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

type BaseReaderLayoutProps = PropsWithChildren<{
  sidebarRef?: React.RefObject<HTMLDivElement>;
}>;
type NonMobileReaderLayoutProps = BaseReaderLayoutProps;
function BaseReaderLayout(props: NonMobileReaderLayoutProps): JSX.Element {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const { sidebarRef } = props;
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [mainWidthPercent, setMainWidthPercent] = usePersistedState<number>(
    56,
    "RD_WORK_WIDTH2"
  );
  const [gutterSize, setGutterSize] = usePersistedState<number>(
    100,
    "RD_TOTAL_WIDTH2"
  );
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight);
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
        className="readerMain"
        id={LARGE_VIEW_MAIN_COLUMN_ID}
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidthPercent}%`,
        }}>
        {mainContent}
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
        className="readerSide"
        style={{
          ...COLUMN_STYLE,
          width: `calc(${100 - mainWidthPercent}% - ${3 * DRAGGER_SIZE}px)`,
        }}
        ref={sidebarRef}>
        <ContentBox isSmall>
          <>
            {sidebarBar}
            <div style={{ paddingRight: "8px" }}>{sidebarContent}</div>
          </>
        </ContentBox>
      </div>
      <ResizingDragger
        currentLen={gutterSize}
        setCurrentLen={setGutterSize}
        maxRatio={0.3}
      />
    </div>
  );
}
