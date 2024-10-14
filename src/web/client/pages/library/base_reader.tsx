import { assert } from "@/common/assert";
import { Container } from "@/web/client/components/generic/basics";
import {
  usePersistedBool,
  usePersistedNumber,
} from "@/web/client/utils/hooks/persisted_state";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
  isDefaultSidebarTab,
} from "@/web/client/pages/library/reader_sidebar_components";
import { StyleContext } from "@/web/client/styling/style_context";
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
  scale: number;
}
/** Properties for the main column. */
export interface BaseMainColumnProps extends Responsive {
  onWordSelected: (word: string) => unknown;
  scale: number;
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
  const [totalWidth, setTotalWidth] = usePersistedNumber(1, "RD_TOTAL_WIDTH");
  const [mainWidth, setMainWidth] = usePersistedNumber(56, "RD_WORK_WIDTH");
  const [swipeNavigation, setSwipeNavigation] = usePersistedBool(
    true,
    "RD_MB_NAV_SWIPE"
  );
  const [tapNavigation, setTapNavigation] = usePersistedBool(
    false,
    "RD_MB_NAV_SIDE_TAP"
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

  const {
    readerMainScale,
    setReaderMainScale,
    readerSideScale,
    setReaderSideScale,
  } = React.useContext(StyleContext);

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
      mainWidth={mainWidth}
      totalWidth={totalWidth}
      sidebarRef={sidebarRef}
      drawerHeight={drawerHeight}
      setDrawerHeight={setDrawerHeight}
      swipeNavigation={swipeNavigation}
      tapNavigation={tapNavigation}
      swipeListeners={swipeListeners}>
      <props.MainColumn
        {...props}
        scale={readerMainScale}
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
          scale={readerSideScale}
          mainScale={readerMainScale}
          setMainScale={setReaderMainScale}
          sideScale={readerSideScale}
          setSideScale={setReaderSideScale}
          totalWidth={isScreenSmall ? undefined : totalWidth}
          setTotalWidth={isScreenSmall ? undefined : setTotalWidth}
          mainWidth={isScreenSmall ? undefined : mainWidth}
          setMainWidth={isScreenSmall ? undefined : setMainWidth}
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
        <props.ExtraSidebarContent
          {...props}
          tab={sidebarTab}
          scale={readerSideScale}
        />
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

function DragHelper(
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
          currentHeight={drawerHeight}
          setCurrentHeight={setDrawerHeight}>
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
const CONTAINER_STYLE: CSSProperties = {
  height:
    window.innerHeight -
    APP_BAR_MAX_HEIGHT -
    COLUMN_TOP_MARGIN -
    COLUMN_BOTTON_MARGIN,
};
const COLUMN_STYLE: CSSProperties = {
  height: "100%",
  float: "left",
  width: "48%",
  overflow: "auto",
  boxSizing: "border-box",
  marginTop: COLUMN_TOP_MARGIN,
  marginBottom: COLUMN_BOTTON_MARGIN,
  marginLeft: "1%",
  marginRight: "1%",
};
const WIDTH_LOOKUP: ("lg" | "xl" | "xxl" | undefined)[] = [
  "lg",
  "xl",
  "xxl",
  undefined,
];

type BaseReaderLayoutProps = PropsWithChildren<{
  sidebarRef?: React.RefObject<HTMLDivElement>;
}>;
interface NonMobileReaderLayoutProps extends BaseReaderLayoutProps {
  mainWidth: number;
  totalWidth: number;
}
function BaseReaderLayout(props: NonMobileReaderLayoutProps): JSX.Element {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const { mainWidth, totalWidth, sidebarRef } = props;

  return (
    <Container maxWidth={WIDTH_LOOKUP[totalWidth]} style={CONTAINER_STYLE}>
      <div
        className="readerMain"
        id="readerMainColumn"
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidth}%`,
        }}>
        {mainContent}
      </div>
      <div
        className="readerSide"
        style={{
          ...COLUMN_STYLE,
          width: `${96 - mainWidth}%`,
        }}
        ref={sidebarRef}>
        <ContentBox isSmall>
          <>
            {sidebarBar}
            <div style={{ paddingRight: "8px" }}>{sidebarContent}</div>
          </>
        </ContentBox>
      </div>
    </Container>
  );
}
