import { assert } from "@/common/assert";
import { Container } from "@/web/client/components/generic/basics";
import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
  isDefaultSidebarTab,
} from "@/web/client/pages/library/reader_sidebar_components";
import { StyleContext } from "@/web/client/styling/style_context";
import React, { CSSProperties, PropsWithChildren, useState } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { DraggableCore } from "react-draggable";

const noSsr = { noSsr: true };

type SidebarTab<T> = T | DefaultSidebarTab;
interface Responsive {
  isMobile: boolean;
}
interface SidebarConfig<CustomTabs> {
  initialSidebarTab?: SidebarTab<CustomTabs>;
  sidebarTabConfigs?: ReaderInternalTabConfig<SidebarTab<CustomTabs>>[];
  dictActionMessage?: string;
}
export interface BaseExtraSidebarTabProps<CustomSidebarTab> {
  tab: CustomSidebarTab;
  scale: number;
}
export interface BaseMainColumnProps extends Responsive {
  onWordSelected: (word: string) => any;
  scale: number;
}
export interface BaseReaderProps<
  CustomSidebarTab,
  MainColumnProps,
  SidebarProps
> {
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
  const theme = useTheme();
  const isScreenSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);
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

  return (
    <BaseLayout
      mainWidth={mainWidth}
      totalWidth={totalWidth}
      sidebarRef={sidebarRef}>
      <props.MainColumn
        {...props}
        scale={readerMainScale}
        onWordSelected={(word) => {
          sidebarRef.current?.scroll({ top: 0, behavior: "instant" });
          setSidebarTab("Dictionary");
          setDictWord(word);
        }}
        isMobile={isScreenSmall}
      />
      <ReaderInternalNavbar
        currentTab={sidebarTab}
        setCurrentTab={setSidebarTab}
        tabs={props.sidebarTabConfigs || DEFAULT_SIDEBAR_TAB_CONFIGS}
        isMobile={isScreenSmall}
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
          currentTab={sidebarTab}
          setCurrentTab={setSidebarTab}
          dictWord={dictWord}
          setDictWord={setDictWord}
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

function DragHelper(
  props: PropsWithChildren<{
    childRef: React.RefObject<HTMLDivElement>;
    currentHeight: number;
    setCurrentHeight: (h: number) => any;
  }>
) {
  const children = React.Children.toArray(props.children);
  assert(children.length === 1);
  const pendingHeight = React.useRef<number>(window.innerHeight * 0.05);
  const { currentHeight, setCurrentHeight } = props;

  return (
    <DraggableCore
      nodeRef={props.childRef}
      onDrag={(_, data) => {
        const proposed = pendingHeight.current - data.deltaY;
        const max = window.innerHeight * 0.5;
        const min = 0;
        const newHeight =
          proposed > max ? max : proposed < min ? min : proposed;
        pendingHeight.current = newHeight;
        if (Math.abs(currentHeight - pendingHeight.current) < 5) {
          return;
        }
        if (Math.abs(currentHeight - pendingHeight.current) < 10) {
          setCurrentHeight(pendingHeight.current);
          return;
        }
        setCurrentHeight(
          pendingHeight.current > currentHeight
            ? currentHeight + 10
            : currentHeight - 10
        );
      }}>
      {children[0]}
    </DraggableCore>
  );
}

export function BaseMobileReaderLayout(props: BaseReaderLayoutProps) {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const { sidebarRef } = props;
  const drawerTopRef = React.useRef<HTMLDivElement>(null);
  const [drawerHeight, setDrawerHeight] = useState<number>(
    window.innerHeight * 0.05
  );

  return (
    <div>
      <Container className="readerMain" disableGutters>
        {mainContent}
        <div
          style={{
            height: window.innerHeight * 0.5,
          }}
        />
      </Container>
      <Container
        className="readerSide bgColor"
        disableGutters
        style={{ position: "fixed", bottom: 0, zIndex: 1 }}>
        <DragHelper
          childRef={drawerTopRef}
          currentHeight={drawerHeight}
          setCurrentHeight={setDrawerHeight}>
          <div
            ref={drawerTopRef}
            style={{
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            }}>
            {sidebarBar}
          </div>
        </DragHelper>
        <Container
          innerRef={sidebarRef}
          style={{
            overflowY: "auto",
            height: drawerHeight,
          }}>
          <ContentBox isSmall>
            <div style={{ paddingRight: "8px" }} onClick={() => {}}>
              {sidebarContent}
            </div>
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
