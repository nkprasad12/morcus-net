import { assert } from "@/common/assert";
import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
  isDefaultSidebarTab,
} from "@/web/client/pages/library/reader_sidebar_components";
import { BaseReaderLayout } from "@/web/client/pages/library/reader_utils";
import { StyleContext } from "@/web/client/styling/style_context";
import React from "react";

type SidebarTab<T> = T | DefaultSidebarTab;
interface SidebarConfig<CustomTabs> {
  initialSidebarTab?: SidebarTab<CustomTabs>;
  sidebarTabConfigs?: ReaderInternalTabConfig<SidebarTab<CustomTabs>>[];
  dictActionMessage?: string;
}
export interface BaseExtraSidebarTabProps<CustomSidebarTab> {
  tab: CustomSidebarTab;
  scale: number;
}
export interface BaseMainColumnProps {
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
    "Without `sidebarTabConfigs`, the `BaseReader` will surface navigation icons for custom tabs."
  );

  return (
    <BaseReaderLayout
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
      />
      <ReaderInternalNavbar
        currentTab={sidebarTab}
        setCurrentTab={setSidebarTab}
        tabs={props.sidebarTabConfigs || DEFAULT_SIDEBAR_TAB_CONFIGS}
      />
      {showDefaultTab ? (
        <DefaultReaderSidebarContent
          scale={readerSideScale}
          mainScale={readerMainScale}
          setMainScale={setReaderMainScale}
          sideScale={readerSideScale}
          setSideScale={setReaderSideScale}
          totalWidth={totalWidth}
          setTotalWidth={setTotalWidth}
          mainWidth={mainWidth}
          setMainWidth={setMainWidth}
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
    </BaseReaderLayout>
  );
}
