import { assert } from "@/common/assert";
import { usePersistedState } from "@/web/client/utils/hooks/persisted_state";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
} from "@/web/client/pages/library/reader_sidebar_components";
import React, {
  PropsWithChildren,
  useEffect,
  useState,
  useCallback,
  JSX,
  useLayoutEffect,
} from "react";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { Footer } from "@/web/client/components/footer";
import {
  SwipeListener,
  SwipeListeners,
  useSwipeListener,
} from "@/web/client/mobile/gestures";
import { useWakeLock } from "@/web/client/mobile/wake_lock";
import { useMediaQuery } from "@/web/client/utils/media_query";
import {
  BottomDrawer,
  ResizeablePanels,
} from "@/web/client/components/draggables";

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
export interface BaseExtraSidebarTabProps<CustomSidebarTab> extends Responsive {
  tab: CustomSidebarTab | DefaultSidebarTab;
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
  const [drawerMinimized, setDrawerMinimized] = useState<boolean>(false);
  const isScreenSmall = useMediaQuery("(max-width: 900px)");

  useLayoutEffect(() => {
    // On a small screen, we have to set scrollPaddingTop on the document
    // because that it what is scrolling. On a wide screen, there reader text
    // is in a column that itself scrolls.
    const value = isScreenSmall ? "48px" : "0px";
    document.documentElement.style.scrollPaddingTop = value;
    return () => {
      document.documentElement.style.scrollPaddingTop = "0px";
    };
  }, [isScreenSmall]);

  const BaseLayout = isScreenSmall ? BaseMobileReaderLayout : BaseReaderLayout;

  const sidebarRef = React.useRef<HTMLDivElement>(null);

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
      setDrawerMinimized(false);
    },
    [onDictWord, setDrawerMinimized]
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
      drawerMinimized={drawerMinimized}
      setDrawerMinimized={setDrawerMinimized}
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
      <>
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
        {props.ExtraSidebarContent && (
          <props.ExtraSidebarContent
            {...props}
            tab={sidebarTab}
            isMobile={isScreenSmall}
          />
        )}
      </>
    </BaseLayout>
  );
}

// The maximum size of the drawer as a ratio of the screen height.
const DRAWER_MAX_SIZE = 0.6;

/** Exported only for testing. Do not use externally. */
export function handleSideTap(
  e: { clientX: number },
  listener?: SwipeListener
) {
  const position = e.clientX / window.innerWidth;
  const edgeDistance = Math.min(position, Math.abs(1 - position));
  if (edgeDistance < 0.075 && listener) {
    const direction = position < 0.5 ? "Right" : "Left";
    listener(direction, 1, { x: 0.5, y: 0.5 });
  }
}

interface MobileReaderLayoutProps
  extends BaseReaderLayoutProps,
    ReaderExternalLayoutProps {
  drawerHeight: number;
  setDrawerHeight: React.Dispatch<React.SetStateAction<number>>;
  drawerMinimized?: boolean;
  setDrawerMinimized?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function BaseMobileReaderLayout(props: MobileReaderLayoutProps) {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const {
    sidebarRef,
    drawerHeight,
    setDrawerHeight,
    drawerMinimized,
    setDrawerMinimized,
  } = props;
  const swipeListeners: SwipeListeners = React.useMemo(
    () => (props.swipeNavigation ? props.swipeListeners ?? {} : {}),
    [props.swipeNavigation, props.swipeListeners]
  );
  useSwipeListener(swipeListeners);

  return (
    <div>
      <div
        className="readerMain"
        onClick={
          props.tapNavigation === true
            ? (e) => handleSideTap(e, props.swipeListeners?.onSwipeEnd)
            : undefined
        }>
        {mainContent}
        <Footer marginRatio={DRAWER_MAX_SIZE} />
      </div>
      <BottomDrawer
        containerClass="readerSide"
        drawerHeight={drawerHeight}
        setDrawerHeight={setDrawerHeight}
        drawerMinimized={drawerMinimized}
        setDrawerMinimized={setDrawerMinimized}
        maxRatio={DRAWER_MAX_SIZE}
        drawerContentRef={sidebarRef}>
        {sidebarBar}
        {sidebarContent}
      </BottomDrawer>
    </div>
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

  return (
    <ResizeablePanels
      mainClass="readerMain"
      sideClass="readerSide"
      mainId={LARGE_VIEW_MAIN_COLUMN_ID}
      sideRef={sidebarRef}>
      {mainContent}
      <ContentBox isSmall>
        {sidebarBar}
        <div style={{ paddingRight: "8px" }}>{sidebarContent}</div>
      </ContentBox>
    </ResizeablePanels>
  );
}
