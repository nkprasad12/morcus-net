import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import {
  InfoText,
  NavIcon,
  SettingsText,
} from "@/web/client/pages/library/reader_utils";
import { NumberSelector } from "@/web/client/components/generic/selectors";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { StyleContext } from "@/web/client/styling/style_context";
import { useContext, JSX } from "react";
import { Divider } from "@/web/client/components/generic/basics";

export interface EmbeddedDictionaryProps {
  /** The word to look up in the dictionary, if any. */
  dictWord?: string;
  /**
   * The setter to use for `dictWord`. This is called if interactions
   * within the embedded dictionary request a new word.
   */
  setDictWord: (word: string) => unknown;
  /**
   * The message to display in the instruction text for the dictionary.
   * This should instruct the user what action to perform on a word in
   * the main panel to get a dictionary lookup.
   */
  dictActionMessage?: string;
}

export function EmbeddedDictionary(
  props: EmbeddedDictionaryProps
): JSX.Element {
  const styles = useContext(StyleContext);
  const action = props.dictActionMessage || "Click on";
  return props.dictWord === undefined ? (
    <InfoText
      text={`${action} a word for dictionary and inflection lookups.`}
    />
  ) : (
    <DictionaryViewV2
      embedded
      initial={props.dictWord}
      textScale={styles.readerSideScale}
      embeddedOptions={{ hideableOutline: true }}
      setInitial={props.setDictWord}
    />
  );
}

export interface MobileReaderSettings {
  /** Whether swipe navigation is enabled. */
  swipeNavigation?: boolean;
  /** A setter for swipe nagivation */
  setSwipeNavigation?: (v: boolean) => unknown;
  /** Whether side tap navigation is enabled. */
  tapNavigation?: boolean;
  /** A setter for side tab nagivation */
  setTapNavigation?: (v: boolean) => unknown;
}
export function MobileReaderSettingsSections(props: MobileReaderSettings) {
  const {
    swipeNavigation,
    setSwipeNavigation,
    tapNavigation,
    setTapNavigation,
  } = props;
  const hasSwipeNav =
    swipeNavigation !== undefined && setSwipeNavigation !== undefined;
  const hasTapNav =
    tapNavigation !== undefined && setTapNavigation !== undefined;
  const hasNavSettings = hasSwipeNav || hasTapNav;
  if (!hasNavSettings) {
    return null;
  }

  return (
    <details open>
      <summary>
        <SettingsText message="Navigation" />
      </summary>
      {hasSwipeNav && (
        <div>
          <input
            type="checkbox"
            id="swipeNav"
            name="swipeNav"
            checked={swipeNavigation}
            onChange={(e) => setSwipeNavigation(e.currentTarget.checked)}
          />
          <label htmlFor="swipeNav" className="text md">
            Swipe to change page
          </label>
        </div>
      )}
      {hasTapNav && (
        <div>
          <input
            type="checkbox"
            id="tapNav"
            name="tapNav"
            checked={tapNavigation}
            onChange={(e) => setTapNavigation(e.currentTarget.checked)}
          />
          <label htmlFor="tapNav" className="text md">
            Tap edge to change page [Beta]
          </label>
        </div>
      )}
    </details>
  );
}

export interface ReaderSettingsProps extends MobileReaderSettings {
  /** Whether the reader is a small screen. */
  isSmallScreen: boolean;
}
export function ReaderSettings(props: ReaderSettingsProps) {
  const { isSmallScreen } = props;
  const styles = useContext(StyleContext);

  const mainLabel = isSmallScreen ? "Main panel" : "Main column";
  const sideLabel = isSmallScreen ? "Drawer" : "Side column";
  return (
    <>
      <MobileReaderSettingsSections {...props} />
      <details open>
        <summary>
          <SettingsText message={`${mainLabel} settings`} />
        </summary>
        <NumberSelector
          value={styles.readerMainScale}
          setValue={styles.setReaderMainScale}
          label="Text size"
          tag={mainLabel}
          min={50}
          max={150}
          step={10}
        />
      </details>
      <details open>
        <summary>
          <SettingsText message={`${sideLabel} settings`} />
        </summary>
        <NumberSelector
          value={styles.readerSideScale}
          setValue={styles.setReaderSideScale}
          label="Text size"
          tag={sideLabel}
          min={50}
          max={150}
          step={10}
        />
      </details>
    </>
  );
}

export type SideTabType = string;
interface ReaderSideNavIconProps<T> {
  Icon: JSX.Element;
  tab: T;
  onTabClicked: (t: T) => unknown;
  currentlySelected: T;
}
function ReaderSideNavIcon<T extends SideTabType>(
  props: ReaderSideNavIconProps<T>
) {
  const isSelected = props.currentlySelected === props.tab;
  return (
    <NavIcon
      Icon={props.Icon}
      label={props.tab}
      onClick={() => props.onTabClicked(props.tab)}
      extraClasses={isSelected ? ["selectedSidePanelTab"] : undefined}
    />
  );
}

const TAB_DICT = "Dictionary";
const TAB_SETTINGS = "Reader settings";
export const DEFAULT_SIDEBAR_TAB_CONFIGS: ReaderInternalTabConfig<DefaultSidebarTab>[] =
  [
    { tab: TAB_DICT, Icon: <SvgIcon pathD={SvgIcon.MenuBook} /> },
    { tab: TAB_SETTINGS, Icon: <SvgIcon pathD={SvgIcon.Settings} /> },
  ];
export type DefaultSidebarTab = typeof TAB_DICT | typeof TAB_SETTINGS;
export function isDefaultSidebarTab(x: unknown): x is DefaultSidebarTab {
  return x === TAB_DICT || x === TAB_SETTINGS;
}
export interface ReaderInternalTabConfig<T> {
  /** The icon to display in the tab. */
  Icon: JSX.Element;
  /** The identifier for this tab. */
  tab: T;
}
export interface ReaderInternalNavbarProps<T> {
  /** The tabs to display in the bar. */
  tabs: ReaderInternalTabConfig<T>[];
  /** The currently selected tab. */
  currentTab: T;
  /** The callback invoked to set the currently selected tab. */
  setCurrentTab: (t: T) => unknown;
  /** Which special component the navbar is nested in. */
  location?: "Drawer";
}
export function ReaderInternalNavbar<T extends SideTabType>(
  props: ReaderInternalNavbarProps<T>
) {
  return (
    <div
      className={
        props.location === "Drawer" ? "readerMobileBottomBar" : "readerIconBar"
      }>
      {props.tabs.map((tab) => (
        <ReaderSideNavIcon
          Icon={tab.Icon}
          tab={tab.tab}
          key={tab.tab}
          onTabClicked={props.setCurrentTab}
          currentlySelected={props.currentTab}
        />
      ))}
    </div>
  );
}

export interface DefaultReaderSidebarContentProps<T>
  extends ReaderSettingsProps {
  currentTab: DefaultSidebarTab | T;
  setCurrentTab: (tab: DefaultSidebarTab | T) => unknown;
  dictWord?: string;
  setDictWord: (word: string) => unknown;
  dictActionMessage?: string;
}

export function ReaderSideTab<T, U extends T>(
  props: React.PropsWithChildren<{ forTab: U; currentTab: T }>
) {
  return (
    <div
      key={props.forTab}
      style={{
        display: props.forTab === props.currentTab ? undefined : "none",
        overflowY: "auto",
        padding: "2px 4px 0px",
        height: "100%",
      }}>
      {props.children}
      <Divider style={{ margin: "8px 0px" }} />
      <div style={{ height: "2px" }} />
    </div>
  );
}

export function DefaultReaderSidebarContent<T>(
  props: DefaultReaderSidebarContentProps<T>
) {
  const currentTab = props.currentTab;
  return (
    <>
      <ReaderSideTab forTab="Reader settings" currentTab={currentTab}>
        <ReaderSettings {...props} />
      </ReaderSideTab>
      <ReaderSideTab forTab="Dictionary" currentTab={currentTab}>
        <EmbeddedDictionary
          dictWord={props.dictWord}
          setDictWord={(target) => {
            props.setCurrentTab("Dictionary");
            props.setDictWord(target);
          }}
          dictActionMessage={props.dictActionMessage}
        />
      </ReaderSideTab>
    </>
  );
}
