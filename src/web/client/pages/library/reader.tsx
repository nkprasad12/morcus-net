import {
  DocumentInfo,
  WorkId,
  type NavTreeNode,
  type ProcessedWork2,
  type ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { ClientPaths } from "@/web/client/routing/client_paths";

import { useEffect, useState, JSX } from "react";
import * as React from "react";
import {
  areArraysEqual,
  exhaustiveGuard,
  safeParseInt,
} from "@/common/misc_utils";
import { ClickableTooltip, CopyLinkTooltip } from "@/web/client/pages/tooltips";
import {
  SettingsText,
  InfoText,
  capitalizeWords,
  NavIcon,
  TooltipNavIcon,
} from "@/web/client/pages/library/reader_utils";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultSidebarTab,
  ReaderInternalTabConfig,
} from "@/web/client/pages/library/reader_sidebar_components";
import {
  BaseExtraSidebarTabProps,
  BaseMainColumnProps,
  BaseReader,
  LARGE_VIEW_MAIN_COLUMN_ID,
  SWIPE_NAV_KEY,
  TAP_NAV_KEY,
} from "@/web/client/pages/library/base_reader";
import { NavHelper, RouteInfo, Router } from "@/web/client/router/router_v2";
import { MIN_SWIPE_SIZE, SwipeDirection } from "@/web/client/mobile/gestures";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { usePersistedValue } from "@/web/client/utils/hooks/persisted_state";
import {
  navigateToSection,
  type PaginatedWork,
} from "@/web/client/pages/library/reader/library_reader/library_reader_common";
import { processWords } from "@/common/text_cleaning";
import { checkPresent } from "@/common/assert";
import { StyleContext } from "@/web/client/styling/style_context";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { GetWork } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";
import { textCallback } from "@/web/client/utils/callback_utils";

const SPECIAL_ID_PARTS = new Set(["appendix", "prologus", "epilogus"]);

type WorkState = PaginatedWork | "Loading" | "Error";

function resolveWorkId(path: string): WorkId | undefined {
  const byNameParams = ClientPaths.WORK_BY_NAME.parseParams(path);
  const urlAuthor = byNameParams?.author;
  const urlName = byNameParams?.name;
  if (urlAuthor !== undefined && urlName !== undefined) {
    return { nameAndAuthor: { urlAuthor, urlName } };
  }
  const byIdParams = ClientPaths.WORK_PAGE.parseParams(path);
  const id = byIdParams?.workId;
  if (id !== undefined) {
    return { id };
  }
  return undefined;
}

function incrementPage(
  offset: number,
  currentPage: number,
  nav: NavHelper<RouteInfo>,
  work: PaginatedWork
) {
  const proposed = offset + currentPage;
  // Nav pages are 1-indexed.
  const newPage = Math.min(Math.max(0, proposed), work.pages.length - 1) + 1;
  updatePage(newPage, nav, work);
}

function updatePage(
  newPage: number,
  nav: NavHelper<RouteInfo>,
  work: PaginatedWork,
  replace?: boolean
) {
  const sectionId = work.pages[newPage - 1].id.join(".");
  navigateToSection(sectionId, nav, work, replace);
}

interface ReaderState {
  hasTooltip: React.MutableRefObject<Set<number>>;
  urlId?: string;
  highlightRef?: React.RefObject<HTMLSpanElement>;
}

const ReaderContext = React.createContext<ReaderState>({
  hasTooltip: { current: new Set<number>() },
});

interface WorkColumnContextType {
  setDictWord: (word: string) => unknown;
  // It should be provided everywhere, but it's a pain to
  // provide a default value.
  work?: ProcessedWork2;
}

const WorkColumnContext = React.createContext<WorkColumnContextType>({
  setDictWord: () => {},
});

function fetchWork(
  workId: WorkId,
  onWorkState: (state: WorkState) => unknown
): Promise<unknown> {
  onWorkState("Loading");
  return callApi(GetWork, {
    ...workId,
    commitHash: getCommitHash(),
  })
    .then(onWorkState)
    .catch((e) => {
      console.error(e);
      onWorkState("Error");
    });
}

export function ReadingPage() {
  const [work, setWork] = useState<WorkState>("Loading");
  const [translation, setTranslation] = useState<WorkState | undefined>(
    undefined
  );
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [swipeDir, setSwipeDir] = useState<SwipeDirection>("Left");
  const hasTooltip = React.useRef<Set<number>>(new Set<number>());
  const highlightRef = React.useRef<HTMLSpanElement>(null);

  const { nav, route } = Router.useRouter();

  const loadTranslation = React.useCallback(
    (translationId: string) => fetchWork({ id: translationId }, setTranslation),
    []
  );

  const urlId = route.params?.id;
  const findMatchPage = React.useCallback(
    (loadedWork: WorkState) => {
      if (
        typeof loadedWork === "string" ||
        loadedWork.pages.length === 0 ||
        urlId === undefined
      ) {
        return undefined;
      }
      const id = urlId.trim();
      const idParts = id.length === 0 ? [] : id.split(".");
      const idSubset = idParts.slice(0, loadedWork.pages[0].id.length);
      return loadedWork.pages.findIndex((page) =>
        areArraysEqual(page.id, idSubset)
      );
    },
    [urlId]
  );

  const currentPage = React.useMemo(
    () => findMatchPage(work),
    [findMatchPage, work]
  );

  const translationPage = React.useMemo(
    () => (translation === undefined ? undefined : findMatchPage(translation)),
    [translation, findMatchPage]
  );

  // Redirect initial page
  useEffect(() => {
    if (typeof work === "string" || urlId !== undefined) {
      return;
    }
    updatePage(1, nav, work, true);
  }, [work, urlId, nav]);

  // Fetch data
  useEffect(() => {
    const workId = resolveWorkId(route.path);
    if (workId === undefined) {
      setWork("Error");
      return;
    }
    fetchWork(workId, setWork);
  }, [route.path]);

  useEffect(() => {
    // Continue if we have a loaded work and there's an ID in the URL.
    // The case where we don't have an ID is handled by redirection to the start page.
    if (urlId === undefined || typeof work === "string") {
      return;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    // Otherwise, just reset position to the top.
    window.scrollTo({ top: 0, behavior: "instant" });
    const twoColumnMain = document.getElementById(LARGE_VIEW_MAIN_COLUMN_ID);
    twoColumnMain?.scrollTo({ top: 0, behavior: "instant" });
  }, [urlId, work]);

  useEffect(() => {
    hasTooltip.current = new Set();
  }, [currentPage]);

  return (
    <ReaderContext.Provider value={{ hasTooltip, urlId, highlightRef }}>
      <BaseReader<WorkColumnProps, CustomTabs, SidebarProps>
        MainColumn={WorkColumn}
        ExtraSidebarContent={Sidebar}
        initialSidebarTab="Attribution"
        sidebarTabConfigs={SIDEBAR_PANEL_ICONS}
        work={work}
        currentPage={currentPage}
        overlayOpacity={overlayOpacity}
        showMobileNavSettings
        loadTranslation={loadTranslation}
        translation={translation}
        translationPage={translationPage}
        swipeDir={swipeDir}
        swipeListeners={{
          onSwipeCancel: () => setOverlayOpacity(0),
          onSwipeProgress: (direction, size) => {
            if (typeof work === "string" || hasTooltip.current.size > 0) {
              return;
            }
            setSwipeDir(direction);
            const progress = (size - MIN_SWIPE_SIZE) / 0.16;
            setOverlayOpacity(Math.min(progress * progress, 1));
          },
          onSwipeEnd: (direction, size) => {
            if (
              typeof work === "string" ||
              currentPage === undefined ||
              currentPage === -1 ||
              hasTooltip.current.size > 0
            ) {
              return;
            }
            setOverlayOpacity(0);
            if (size >= MIN_SWIPE_SIZE + 0.16) {
              const offset = direction === "Right" ? -1 : 1;
              incrementPage(offset, currentPage, nav, work);
            }
          },
        }}
      />
    </ReaderContext.Provider>
  );
}

type CustomTabs = "Outline" | "Attribution" | "Translation"; // | "TextSearch";
type SidebarPanel = CustomTabs | DefaultSidebarTab;

const SIDEBAR_PANEL_ICONS: ReaderInternalTabConfig<SidebarPanel>[] = [
  { tab: "Outline", Icon: <SvgIcon pathD={SvgIcon.Toc} /> },
  ...DEFAULT_SIDEBAR_TAB_CONFIGS,
  { tab: "Attribution", Icon: <SvgIcon pathD={SvgIcon.Info} /> },
  { tab: "Translation", Icon: <SvgIcon pathD={SvgIcon.AutoStories} /> },
  // { tab: "TextSearch", Icon: <SvgIcon pathD={SvgIcon.Search} /> },
];

interface SidebarProps {
  work: WorkState;
  translation: WorkState | undefined;
  loadTranslation: (translationId: string) => unknown;
  translationPage?: number;
}
function Sidebar(props: SidebarProps & BaseExtraSidebarTabProps<CustomTabs>) {
  const tab = props.tab;
  const work = typeof props.work === "string" ? undefined : props.work;
  switch (tab) {
    case "Outline":
      return <>{work && <WorkNavigationSection work={work} />}</>;
    case "Attribution":
      return <>{work?.info && <WorkInfo workInfo={work?.info} />}</>;
    case "Translation":
      return (
        <div className="text md">
          <TranslationTab {...props} />
        </div>
      );
    // case "TextSearch":
    //   return <>{work && <TextSearchSection work={work} />}</>;
    default:
      exhaustiveGuard(tab);
  }
}

function TranslationTab(props: {
  work: WorkState;
  translation?: WorkState;
  loadTranslation: (translationId: string) => unknown;
  translationPage?: number;
  isMobile: boolean;
}) {
  const { work, translation } = props;
  if (typeof work === "string") {
    return <span>Main work not yet loaded.</span>;
  }
  const translationId = work.info.translationId;
  if (translationId === undefined) {
    return <span>No translation available for this text.</span>;
  }
  if (translation === undefined) {
    return (
      <button
        onClick={() => props.loadTranslation(translationId)}
        className="text md outline">
        Load translation [Beta]
      </button>
    );
  }
  if (translation === "Error" || props.translationPage === undefined) {
    return <span>Error loading translation.</span>;
  }
  if (translation === "Loading") {
    return <span>Loading translation...</span>;
  }

  return (
    <WorkTextPage
      work={translation}
      page={props.translationPage}
      isMobile={props.isMobile}
      setDictWord={() => {}}
    />
  );
}

export function SwipeFeedback(props: {
  overlayOpacity: number;
  swipeDir: SwipeDirection;
}) {
  const { overlayOpacity, swipeDir } = props;
  if (overlayOpacity === 0) {
    return null;
  }

  const dir = swipeDir === "Right" ? "previous" : "next";
  const action = overlayOpacity === 1 ? "Release" : "Swipe";

  return (
    <div
      className="unselectable text md bgAlt"
      aria-label={`${action} for ${dir} page`}
      style={{
        position: "fixed",
        top: 150,
        left: swipeDir === "Right" ? 10 : undefined,
        right: swipeDir === "Left" ? 10 : undefined,
        opacity: overlayOpacity,
        padding: "4px",
        borderRadius: 8,
        borderStyle: "solid",
        borderWidth: 4,
        borderColor: overlayOpacity === 1 ? "green" : undefined,
      }}>
      {props.swipeDir === "Left" ? (
        <SvgIcon pathD={SvgIcon.ArrowForward} />
      ) : (
        <SvgIcon pathD={SvgIcon.ArrowBack} />
      )}
    </div>
  );
}

function touchNavBlurbs(swipeNavOn: boolean, tapNavOn: boolean): string[] {
  const blurbs: string[] = [];
  if (swipeNavOn) {
    blurbs.push("swipe horizontally");
  }
  if (tapNavOn) {
    blurbs.push("tap the side of the screen");
  }
  return blurbs;
}

function NavigationInfoBlurb(props: { isMobile: boolean }) {
  const tapNav = usePersistedValue<boolean>(false, TAP_NAV_KEY);
  const swipeNav = usePersistedValue<boolean>(true, SWIPE_NAV_KEY);

  const touchBlurbs = touchNavBlurbs(swipeNav, tapNav);
  const showTouchBlurb = props.isMobile && touchBlurbs.length > 0;
  const touchNavBlurb = showTouchBlurb
    ? `, or ${touchBlurbs.join(" or ")} (on a touch screen)`
    : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 10% 0",
        textAlign: "center",
      }}>
      <div className="text light xs unselectable">
        Click the arrow buttons to navigate. You can also use the arrow keys (on
        a keyboard){touchNavBlurb}.
      </div>
    </div>
  );
}

interface WorkColumnProps {
  work: WorkState;
  currentPage: number | undefined;
  overlayOpacity: number;
  swipeDir: SwipeDirection;
}
function WorkColumn(props: WorkColumnProps & BaseMainColumnProps) {
  const { work, currentPage, isMobile, overlayOpacity } = props;

  return (
    <>
      <SwipeFeedback
        overlayOpacity={overlayOpacity}
        swipeDir={props.swipeDir}
      />
      <ContentBox isSmall mt={isMobile ? 0 : undefined}>
        {work === "Loading" ? (
          <span>{`Loading, please wait`}</span>
        ) : work === "Error" || currentPage === undefined ? (
          <span>
            An error occurred - either the work or section is invalid.
          </span>
        ) : currentPage === -1 ? (
          <div>
            <div>Invalid section.</div>
            <WorkNavigation work={work} />
          </div>
        ) : (
          <>
            <WorkNavigationBar
              page={currentPage}
              work={work}
              isMobile={isMobile}
            />
            <div
              style={{
                lineHeight: props.isMobile ? 1 : undefined,
                paddingTop: props.isMobile ? "8px" : undefined,
              }}>
              <HeaderText data={work} page={currentPage} />
            </div>
            <div
              style={{
                paddingLeft: isMobile ? "12px" : undefined,
                paddingRight: isMobile ? "12px" : "8px",
              }}>
              <WorkTextPage
                work={work}
                page={currentPage}
                isMobile={isMobile}
                setDictWord={props.onWordSelected}
              />
            </div>
          </>
        )}
        <NavigationInfoBlurb isMobile={props.isMobile} />
      </ContentBox>
    </>
  );
}

function HeaderText(props: { data: PaginatedWork; page: number }) {
  if (props.page < 0) {
    return <></>;
  }

  const id = props.data.pages[props.page].id;
  const idLabels: string[] = [];
  for (let i = 0; i < props.data.textParts.length - 1; i++) {
    const parentId = id.slice(0, i + 1);
    idLabels.push(labelForId(parentId, props.data));
  }
  return (
    <div
      className="text sm light"
      style={{ textTransform: "capitalize", margin: "0 8px" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {idLabels.join(", ")}
      </div>
    </div>
  );
}

function labelForId(id: string[], work: PaginatedWork): string {
  const parts = work.textParts;
  const i = id.length - 1;
  if (SPECIAL_ID_PARTS.has(id[i].toLowerCase())) {
    return capitalizeWords(id[i]);
  }
  return capitalizeWords(`${parts[i]} ${id[i]}`);
}

function JumpToSection() {
  const { nav, route } = Router.useRouter();
  const [value, setValue] = useState<string>("");
  const id = route.params?.id ?? "";
  useEffect(() => setValue(id), [id]);
  return (
    <>
      {"§ "}
      <input
        style={{ maxWidth: "48px", borderRadius: "4px" }}
        className="bgColor text"
        aria-label="jump to id"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value ?? "")}
        onKeyUp={(e) => {
          // Make sure the Arrow keys don't trigger navigation.
          if (e.key.includes("Arrow")) {
            e.stopPropagation();
            return;
          }
          if (e.key === "Enter" && value.length > 0) {
            nav.to((old) => ({
              ...old,
              params: {
                ...old.params,
                id: value,
              },
            }));
          }
        }}
      />
    </>
  );
}

function WorkNavigationBar(props: {
  page: number;
  work: PaginatedWork;
  isMobile: boolean;
}) {
  const { nav } = Router.useRouter();
  const navBarRef = React.useRef<HTMLDivElement>(null);
  const { page, work } = props;

  const changePage = React.useCallback(
    (offset: number) => {
      incrementPage(offset, page, nav, work);
    },
    [page, nav, work]
  );

  React.useEffect(() => {
    const keyListener = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        changePage(-1);
      } else if (e.key === "ArrowRight") {
        changePage(1);
      }
    };
    window.addEventListener("keyup", keyListener);
    return () => window.removeEventListener("keyup", keyListener);
  }, [changePage]);

  return (
    <div
      className="readerIconBar"
      ref={navBarRef}
      style={{ display: "flex", alignItems: "center" }}>
      <NavIcon
        Icon={<SvgIcon pathD={SvgIcon.ArrowBack} />}
        label="previous section"
        disabled={page <= 0}
        onClick={() => changePage(-1)}
      />
      <span
        style={{ flexGrow: 1, textAlign: "center" }}
        className="text sm light">
        {(work.info.shortTitle ?? work.info.title) + " "}
        <JumpToSection />
        <CopyLinkTooltip
          forwarded={TooltipNavIcon}
          message="Copy link to page"
          link={window.location.href}
          placement="bottom"
        />
      </span>
      <NavIcon
        Icon={<SvgIcon pathD={SvgIcon.ArrowForward} />}
        label="next section"
        disabled={page >= work.pages.length - 1}
        onClick={() => changePage(1)}
      />
    </div>
  );
}

export function WorkTextPage(props: {
  work: PaginatedWork;
  page: number;
  isMobile: boolean;
  setDictWord: (work: string) => unknown;
}) {
  const { isMobile, work, setDictWord } = props;

  const { readerMainScale } = React.useContext(StyleContext);
  const { urlId, highlightRef, hasTooltip } = React.useContext(ReaderContext);
  const workColumnContext: WorkColumnContextType = React.useMemo(
    () => ({ setDictWord, work }),
    [setDictWord, work]
  );

  const gapSize = (readerMainScale / 100) * 0.65;
  const gap = `${gapSize}em`;
  const hasLines = work.textParts.slice(-1)[0].toLowerCase() === "line";

  const [start, end] = work.pages[props.page].rows;
  const children: JSX.Element[] = [];
  let i = 0;
  for (let j = start; j < end; j++) {
    const [id, content] = work.rows[j];
    const gridRow = j - start + 1;
    if (id.length !== work.textParts.length) {
      children.push(
        <WorkTextColumn
          key={j}
          className="text sm light"
          gridRow={gridRow}
          content={content}
        />
      );
      continue;
    }
    const idLabelParts = id.map((idPart) =>
      safeParseInt(idPart) !== undefined
        ? idPart
        : capitalizeWords(idPart.substring(0, isMobile ? 2 : 3))
    );
    const idLabel = idLabelParts.join(".");
    const shortLabel = idLabelParts
      .slice(isMobile && id.length > 2 ? 2 : 0)
      .join(".");
    const shouldHighlight = urlId === idLabel && end - start > 1;
    const workName = capitalizeWords(props.work.info.title);
    const hideHeaderByDefault =
      hasLines && (isMobile ? i % 2 !== 0 : i !== 0 && (i + 1) % 5 !== 0);
    const showHeader = !hideHeaderByDefault || shouldHighlight;
    children.push(
      <React.Fragment key={j}>
        <span
          style={{ gridColumn: 1, gridRow }}
          ref={shouldHighlight ? highlightRef : undefined}>
          <WorkChunkHeader
            text={shortLabel}
            chunkArrayIndex={i}
            idLabel={idLabel}
            blurb={`${workName} ${idLabel}`}
            latent={!showHeader}
            highlighted={shouldHighlight}
          />
        </span>
        <WorkTextColumn gridRow={gridRow} id={idLabel} content={content} />
      </React.Fragment>
    );
    i++;
  }

  return (
    <WorkColumnContext.Provider value={workColumnContext}>
      <div
        onClick={textCallback((w) => {
          if (hasTooltip.current.size > 0) {
            return false;
          }
          setDictWord(w);
          return true;
        }, "workLatWord")}
        style={{
          display: "inline-grid",
          columnGap: gap,
          marginTop: isMobile ? `${gapSize / 2}em` : gap,
        }}>
        {children}
      </div>
    </WorkColumnContext.Provider>
  );
}

function WorkTextColumn(props: {
  gridRow: number;
  id?: string;
  className?: string;
  content: XmlNode<ProcessedWorkContentNodeType>;
}) {
  return (
    <span
      style={{ gridColumn: 2, gridRow: props.gridRow }}
      id={props.id}
      className={props.className}>
      <span style={{ whiteSpace: "normal" }}>
        {displayForLibraryChunk(props.content)}
      </span>
      {
        "\n" /* Add a newline out of the `whiteSpace: normal` so copy / paste works correctly on Firefox. */
      }
    </span>
  );
}

function InfoLine(props: { value: string; label: string }) {
  return (
    <div>
      <SettingsText message={`${props.label}: ${props.value}`} />
    </div>
  );
}

function WorkNavigation(props: { work: PaginatedWork; node?: NavTreeNode }) {
  const { nav } = Router.useRouter();
  const work = props.work;
  const node = props.node ?? work.navTree;

  if (node.children.length === 0) {
    const id = node.id.join(".");
    return (
      <div style={{ paddingLeft: "8px" }}>
        <span
          className="text sm terminalNavItem"
          onClick={() => navigateToSection(id, nav, work)}>
          {labelForId(node.id, work)}
        </span>
      </div>
    );
  }
  const isRoot = node === work.navTree;
  return (
    <details open={isRoot}>
      <summary>
        <SettingsText
          message={
            isRoot
              ? `Browse ${props.work.info.title}`
              : labelForId(node.id, work)
          }
        />
      </summary>
      <div style={{ marginLeft: `${(node.id.length + 1) * 8}px` }}>
        {node.children.map((child) => (
          <WorkNavigation key={child.id.join(".")} work={work} node={child} />
        ))}
      </div>
    </details>
  );
}

function WorkNavigationSection(props: { work: PaginatedWork }) {
  return (
    <div style={{ marginTop: "4px" }}>
      <WorkNavigation work={props.work} />
    </div>
  );
}

function WorkInfo(props: { workInfo: DocumentInfo }) {
  return (
    <>
      <div>
        <InfoLine label="Author" value={props.workInfo.author} />
        {props.workInfo.editor && (
          <InfoLine label="Editor" value={props.workInfo.editor} />
        )}
        {props.workInfo.funder && (
          <InfoLine label="Funder" value={props.workInfo.funder} />
        )}
        {props.workInfo.sponsor && (
          <InfoLine label="Sponsor" value={props.workInfo.sponsor} />
        )}
        <InfoLine label="ID" value={props.workInfo.workId} />
      </div>
      <div style={{ lineHeight: 1, marginTop: "8px" }}>
        <span className="text sm light">
          The raw text was provided by the Perseus Digital Library and was
          accessed originally from{" "}
          <a href="https://github.com/PerseusDL/canonical-latinLit">
            https://github.com/PerseusDL/canonical-latinLit
          </a>
          . It is provided under Perseus&apos; conditions of the{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC-BY-SA-4.0
          </a>{" "}
          license, and you must offer Perseus any modifications you make.
        </span>
      </div>
    </>
  );
}

function workSectionHeader(
  text: string,
  latent?: boolean,
  highlighted?: boolean
): React.ForwardRefRenderFunction<HTMLSpanElement, object> {
  const classes = ["unselectable", "workHeader"]
    .concat(latent ? ["latent"] : [])
    .concat(highlighted ? ["readerHl"] : []);
  return function InternalWorkSectionHeader(fProps, fRef) {
    return (
      <span {...fProps} ref={fRef}>
        <InfoText
          text={text}
          style={{
            marginLeft: undefined,
            marginRight: undefined,
            cursor: "pointer",
          }}
          additionalClasses={classes}
        />
      </span>
    );
  };
}

function WorkChunkHeader(props: {
  text: string;
  blurb: string;
  idLabel: string;
  chunkArrayIndex: number;
  latent?: boolean;
  highlighted?: boolean;
}) {
  const { hasTooltip } = React.useContext(ReaderContext);
  const { route } = Router.useRouter();

  const url = RouteInfo.toLink(
    {
      path: route.path,
      params: { ...route.params, id: props.idLabel },
    },
    true
  );

  return (
    <CopyLinkTooltip
      forwarded={React.forwardRef<HTMLSpanElement>(
        workSectionHeader(props.text, props.latent, props.highlighted)
      )}
      idToEdit={props.idLabel}
      message={props.blurb}
      placement="right"
      link={url}
      visibleListener={(visible) => {
        if (visible) {
          hasTooltip.current.add(props.chunkArrayIndex);
        } else {
          hasTooltip.current.delete(props.chunkArrayIndex);
        }
      }}
    />
  );
}

function LatLinkify(props: { input: string }) {
  return (
    <>
      {processWords(props.input, (word, i) => (
        <span key={i} className="workLatWord">
          {word}
        </span>
      ))}
    </>
  );
}

function renderTooltip(root: XmlNode): JSX.Element {
  const style: React.CSSProperties = {};
  if (root.name === "br") {
    return <br />;
  }
  const rend = root.getAttr("rend");
  if (rend === "italic") {
    style.fontStyle = "italic";
  }
  if (rend === "overline") {
    style.textDecoration = "overline";
  }
  if (rend === "sup") {
    style.verticalAlign = "super";
  }
  if (root.getAttr("block") === "1") {
    style.display = "block";
  }
  return (
    <span style={style}>
      {root.children.map((c) => (typeof c === "string" ? c : renderTooltip(c)))}
    </span>
  );
}

export const TextNoteContent = React.forwardRef<HTMLButtonElement>(
  function TextNoteContent(fProps, fRef) {
    return (
      <button {...fProps} ref={fRef} aria-label="toggle note">
        <sup className="text md light">*</sup>
      </button>
    );
  }
);

function TextNote(props: { node: XmlNode }) {
  const { work } = React.useContext(WorkColumnContext);
  const { hasTooltip } = React.useContext(ReaderContext);
  const i = checkPresent(safeParseInt(props.node.getAttr("noteId")));
  const note = work?.notes?.[i] ?? null;

  return (
    note && (
      <ClickableTooltip
        titleText={
          <div className="text sm" style={{ padding: "0px 4px" }}>
            {renderTooltip(note)}
          </div>
        }
        ChildFactory={TextNoteContent}
        visibleListener={(isOpen) => {
          if (isOpen) {
            hasTooltip.current.add(-i);
          } else {
            hasTooltip.current.delete(-i);
          }
        }}
      />
    )
  );
}

function displayForLibraryChunk(
  root: XmlNode<ProcessedWorkContentNodeType>,
  key?: number
): JSX.Element {
  const children = root.children.map((child, i) => {
    if (typeof child === "string") {
      return <LatLinkify input={child} key={i} />;
    }
    return displayForLibraryChunk(child, i);
  });
  if (root.name === "note") {
    return <TextNote key={key} node={root} />;
  }
  if (root.name === "space") {
    return <></>;
  }

  const style: React.CSSProperties = {};
  let className: string | undefined = undefined;

  const rend = root.getAttr("rend");
  if (rend === "blockquote") {
    className = rend;
    return React.createElement("span", { key, className }, children);
  }
  if (rend === "indent") {
    style.display = "inline-block";
    // For paragraphs, we want just the start to be indented.
    // For anything else, indent the whole thing so it's visible.
    const isP = root.getAttr("rendParent") === "p";
    style[isP ? "textIndent" : "paddingLeft"] = "1em";
  }
  if (rend === "italic") {
    style.fontStyle = "italic";
  }
  if (root.getAttr("l") !== undefined) {
    className = "l";
  }
  if (["b", "ul", "li"].includes(root.name)) {
    return React.createElement(root.name, { key, style }, children);
  }
  switch (root.name) {
    case "gap":
      return (
        <span key={key} className="text light">
          {" "}
          [gap]{" "}
        </span>
      );
  }
  return (
    <span key={key} style={style} className={className}>
      {children}
    </span>
  );
}
