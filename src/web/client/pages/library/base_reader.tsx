import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import {
  DefaultReaderSidebarContent,
  DefaultSidebarTab,
  ReaderSideNavbar,
  ReaderSideTabConfig,
  isDefaultSidebarTab,
} from "@/web/client/pages/library/reader_sidebar_components";
import { BaseReaderLayout } from "@/web/client/pages/library/reader_utils";
import React from "react";

type SidebarTab<T> = T | DefaultSidebarTab;
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
  initialSidebarTab?: SidebarTab<CustomSidebarTab>;
  sidebarTabConfigs: ReaderSideTabConfig<SidebarTab<CustomSidebarTab>>[];
  MainColumn: (props: MainColumnProps & BaseMainColumnProps) => JSX.Element;
  ExtraSidebarContent: (
    props: BaseExtraSidebarTabProps<CustomSidebarTab> & SidebarProps
  ) => JSX.Element;
}
export function BaseReader<
  CustomSidebarTab extends string,
  MainColumnProps = object,
  SidebarProps = object
>(
  props: BaseReaderProps<CustomSidebarTab, MainColumnProps, SidebarProps> &
    MainColumnProps &
    SidebarProps
) {
  const [sidebarTab, setSidebarTab] = React.useState<
    SidebarTab<CustomSidebarTab>
  >(props.initialSidebarTab || "Dictionary");
  const [dictWord, setDictWord] = React.useState<string | undefined>(undefined);
  const [totalWidth, setTotalWidth] = usePersistedNumber(1, "RD_TOTAL_WIDTH");
  const [mainWidth, setMainWidth] = usePersistedNumber(56, "RD_WORK_WIDTH");
  const [mainScale, setMainScale] = usePersistedNumber(100, "RD_WORK_SCALE");
  const [sidebarScale, setSidebarScale] = usePersistedNumber(
    90,
    "RD_DICT_SCALE"
  );
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  const showDefaultTab = isDefaultSidebarTab(sidebarTab);

  return (
    <BaseReaderLayout
      mainWidth={mainWidth}
      totalWidth={totalWidth}
      sidebarRef={sidebarRef}>
      <props.MainColumn
        {...props}
        scale={mainScale}
        onWordSelected={(word) => {
          sidebarRef.current?.scroll({ top: 0, behavior: "instant" });
          setSidebarTab("Dictionary");
          setDictWord(word);
        }}
      />
      <ReaderSideNavbar
        currentTab={sidebarTab}
        setCurrentTab={setSidebarTab}
        tabs={props.sidebarTabConfigs}
      />
      {showDefaultTab ? (
        <DefaultReaderSidebarContent
          scale={sidebarScale}
          mainScale={mainScale}
          setMainScale={setMainScale}
          sideScale={sidebarScale}
          setSideScale={setSidebarScale}
          totalWidth={totalWidth}
          setTotalWidth={setTotalWidth}
          mainWidth={mainWidth}
          setMainWidth={setMainWidth}
          currentTab={sidebarTab}
          setCurrentTab={setSidebarTab}
          dictWord={dictWord}
          setDictWord={setDictWord}
        />
      ) : (
        <props.ExtraSidebarContent
          {...props}
          tab={sidebarTab}
          scale={sidebarScale}
        />
      )}
    </BaseReaderLayout>
  );
}
