import {
  DocumentInfo,
  ProcessedWork,
  ProcessedWorkNode,
  WorkId,
} from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { ClientPaths } from "@/web/client/routing/client_paths";

import { useEffect, useState } from "react";
import * as React from "react";
import { exhaustiveGuard, safeParseInt } from "@/common/misc_utils";
import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { fetchWork } from "@/web/client/pages/library/work_cache";
import {
  SettingsText,
  InfoText,
  capitalizeWords,
  NavIcon,
  TooltipNavIcon,
} from "@/web/client/pages/library/reader_utils";
import { instanceOf } from "@/web/utils/rpc/parsing";
import { assertEqual } from "@/common/assert";
import {
  DEFAULT_SIDEBAR_TAB_CONFIGS,
  DefaultSidebarTab,
  ReaderInternalTabConfig,
} from "@/web/client/pages/library/reader_sidebar_components";
import {
  BaseExtraSidebarTabProps,
  BaseMainColumnProps,
  BaseReader,
  SWIPE_NAV_KEY,
  TAP_NAV_KEY,
} from "@/web/client/pages/library/base_reader";
import { NavHelper, RouteInfo, Router } from "@/web/client/router/router_v2";
import { MIN_SWIPE_SIZE, SwipeDirection } from "@/web/client/mobile/gestures";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { usePersistedValue } from "@/web/client/utils/hooks/persisted_state";

const SPECIAL_ID_PARTS = new Set(["appendix", "prologus", "epilogus"]);

interface WorkPage {
  id: string[];
}
interface PaginatedWork extends ProcessedWork {
  pages: WorkPage[];
}
type WorkState = PaginatedWork | "Loading" | "Error";

function getWorkNodes(node: ProcessedWorkNode): ProcessedWorkNode[] {
  return node.children.filter(
    (child): child is ProcessedWorkNode => !(child instanceof XmlNode)
  );
}

function divideWork(work: ProcessedWork): WorkPage[] {
  const idLength = work.textParts.length - 1;
  const result: WorkPage[] = [];
  const queue: ProcessedWorkNode[] = [work.root];
  while (queue.length > 0) {
    const top = queue.shift()!;
    if (top.id.length < idLength) {
      for (const child of top.children) {
        if (!(child instanceof XmlNode)) {
          queue.push(child);
        }
      }
    } else if (top.id.length === idLength) {
      result.push({ id: top.id });
    }
  }
  return result;
}

function findSectionById(
  id: string[],
  root: ProcessedWorkNode,
  sectionToCheck: number = 0
): ProcessedWorkNode | undefined {
  if (sectionToCheck >= id.length) {
    return root;
  }
  for (const child of root.children) {
    if (child instanceof XmlNode) {
      continue;
    }
    if (id[sectionToCheck] !== child.id[sectionToCheck]) {
      continue;
    }
    return findSectionById(id, child, sectionToCheck + 1);
  }
  return undefined;
}

function findWorksByLevel(
  level: number,
  root: ProcessedWorkNode
): ProcessedWorkNode[] {
  if (root.id.length > level) {
    return [];
  }
  if (root.id.length === level) {
    return [root];
  }
  const results: ProcessedWorkNode[] = [];
  for (const child of root.children) {
    if (child instanceof XmlNode) {
      continue;
    }
    results.push(...findWorksByLevel(level, child));
  }
  return results;
}

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

function updatePage(
  offset: number,
  currentPage: number,
  nav: NavHelper<RouteInfo>,
  work: PaginatedWork,
  isMobile: boolean
) {
  const proposed = offset + currentPage;
  // Nav pages are 1-indexed.
  const newPage = Math.min(Math.max(0, proposed), work.pages.length - 1) + 1;
  nav.to((old) => ({ path: old.path, params: { pg: `${newPage}` } }));
  const container = isMobile
    ? window
    : document.getElementById("readerMainColumn");
  container?.scrollTo({ top: isMobile ? 64 : 0, behavior: "instant" });
  const id = [work.info.title, work.info.author].join("@");
  LibrarySavedSpot.set(id, newPage);
}

interface ReaderState {
  hasTooltip: React.MutableRefObject<boolean[]>;
  section: ProcessedWorkNode | undefined;
  queryLine?: number;
  highlightRef?: React.RefObject<HTMLSpanElement>;
}

const ReaderContext = React.createContext<ReaderState>({
  hasTooltip: { current: [] },
  section: undefined,
});

export function ReadingPage() {
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [work, setWork] = useState<WorkState>("Loading");
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [swipeDir, setSwipeDir] = useState<SwipeDirection>("Left");
  const hasTooltip = React.useRef<boolean[]>([]);
  const highlightRef = React.useRef<HTMLSpanElement>(null);

  const { nav, route } = Router.useRouter();
  const queryPage = safeParseInt(route.params?.q || route.params?.pg);
  const queryLine = safeParseInt(route.params?.l);

  const section = React.useMemo(
    () =>
      typeof work === "string"
        ? undefined
        : findSectionById(work.pages[currentPage].id, work.root),
    [work, currentPage]
  );

  useEffect(() => {
    const workId = resolveWorkId(route.path);
    if (workId === undefined) {
      setWork("Error");
      return;
    }
    fetchWork(workId)
      .then((data) => {
        const pages = divideWork(data);
        const paginated = { ...data, pages };
        setWork(paginated);
      })
      .catch((reason) => {
        console.debug(reason);
        setWork("Error");
      });
  }, [setWork, route.path]);

  useEffect(() => {
    setCurrentPage(queryPage === undefined ? 0 : queryPage - 1);
  }, [queryPage]);

  useEffect(() => {
    if (queryLine === undefined) {
      return;
    }
    const pollingInterval = 16;
    const tryToScroll = () => {
      if (highlightRef.current === null) {
        setTimeout(tryToScroll, pollingInterval);
      } else {
        highlightRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    };
    tryToScroll();
  }, [queryLine]);

  useEffect(() => {
    if (section === undefined) {
      hasTooltip.current = [];
      return;
    }
    hasTooltip.current = getWorkNodes(section).map((_) => false);
  }, [section]);

  return (
    <ReaderContext.Provider
      value={{ hasTooltip, section, queryLine, highlightRef }}>
      <BaseReader<WorkColumnProps, CustomTabs, SidebarProps>
        MainColumn={WorkColumn}
        ExtraSidebarContent={Sidebar}
        initialSidebarTab="Attribution"
        sidebarTabConfigs={SIDEBAR_PANEL_ICONS}
        work={work}
        currentPage={currentPage}
        overlayOpacity={overlayOpacity}
        showMobileNavSettings
        swipeDir={swipeDir}
        swipeListeners={{
          onSwipeCancel: () => setOverlayOpacity(0),
          onSwipeProgress: (direction, size) => {
            if (typeof work === "string" || hasTooltip.current.some((v) => v)) {
              return;
            }
            setSwipeDir(direction);
            const progress = (size - MIN_SWIPE_SIZE) / 0.16;
            setOverlayOpacity(Math.min(progress * progress, 1));
          },
          onSwipeEnd: (direction, size) => {
            if (typeof work === "string" || hasTooltip.current.some((v) => v)) {
              return;
            }
            setOverlayOpacity(0);
            if (size >= MIN_SWIPE_SIZE + 0.16) {
              const offset = direction === "Right" ? -1 : 1;
              updatePage(offset, currentPage, nav, work, true);
            }
          },
        }}
      />
    </ReaderContext.Provider>
  );
}

type CustomTabs = "Outline" | "Attribution";
type SidebarPanel = CustomTabs | DefaultSidebarTab;

const SIDEBAR_PANEL_ICONS: ReaderInternalTabConfig<SidebarPanel>[] = [
  { tab: "Outline", Icon: <SvgIcon pathD={SvgIcon.Toc} /> },
  ...DEFAULT_SIDEBAR_TAB_CONFIGS,
  { tab: "Attribution", Icon: <SvgIcon pathD={SvgIcon.Info} /> },
];

interface SidebarProps {
  work: WorkState;
}
function Sidebar(props: SidebarProps & BaseExtraSidebarTabProps<CustomTabs>) {
  const tab = props.tab;
  const work = typeof props.work === "string" ? undefined : props.work;
  switch (tab) {
    case "Outline":
      return <>{work && <WorkNavigationSection work={work} />}</>;
    case "Attribution":
      return <>{work?.info && <WorkInfo workInfo={work?.info} />}</>;
    default:
      exhaustiveGuard(tab);
  }
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
        paddingTop: "4px",
        paddingBottom: "4px",
        paddingLeft: "4px",
        paddingRight: "4px",
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
  currentPage: number;
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
        ) : work === "Error" ? (
          <span>
            An error occurred - either the work is invalid or there could be a
            server error
          </span>
        ) : (
          <>
            <WorkNavigationBar
              page={currentPage}
              work={work}
              isMobile={isMobile}
            />
            <div
              style={{
                paddingLeft: isMobile ? "12px" : undefined,
                paddingRight: isMobile ? "12px" : "8px",
              }}>
              <WorkTextPage
                work={work}
                setDictWord={props.onWordSelected}
                page={currentPage}
                textScale={props.scale}
                isMobile={isMobile}
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
  for (let i = 0; i < props.data.textParts.length - 2; i++) {
    const parentId = id.slice(0, i + 1);
    idLabels.push(labelForId(parentId, props.data));
  }
  return (
    <>
      {idLabels.map((idPart) => (
        <InfoText text={capitalizeWords(idPart)} key={idPart} />
      ))}
      <InfoText text={capitalizeWords(props.data.info.title)} />
      <InfoText text={capitalizeWords(props.data.info.author)} />
    </>
  );
}

function labelForId(
  id: string[],
  work: PaginatedWork,
  useHeader: boolean = true
): string {
  const parts = work.textParts;
  const i = id.length - 1;
  if (SPECIAL_ID_PARTS.has(id[i].toLowerCase())) {
    return capitalizeWords(id[i]);
  }
  const text = capitalizeWords(`${parts[i]} ${id[i]}`);
  if (!useHeader) {
    return text;
  }
  const header = findSectionById(id, work.root)?.header;
  const subtitle = header === undefined ? "" : ` (${header})`;
  return text + subtitle;
}

/**
 * A label for the penultimate part of the work division.
 * For example, in a work with Books, Chapters, and Sections, this would show
 * `Chapter N`.
 */
function PenulimateLabel(props: { page: number; work: PaginatedWork }) {
  const parts = props.work.textParts;
  if (props.page < 0 || parts.length <= 1) {
    return <></>;
  }
  const id = props.work.pages[props.page].id;
  return <InfoText text={labelForId(id, props.work, false)} />;
}

function WorkNavigationBar(props: {
  page: number;
  work: PaginatedWork;
  isMobile: boolean;
}) {
  const { nav } = Router.useRouter();
  const navBarRef = React.useRef<HTMLDivElement>(null);
  const { isMobile, page, work } = props;

  const changePage = React.useCallback(
    (offset: number) => {
      updatePage(offset, page, nav, work, isMobile);
    },
    [page, nav, work, isMobile]
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
    <>
      <div className="readerIconBar" ref={navBarRef}>
        <NavIcon
          Icon={<SvgIcon pathD={SvgIcon.ArrowBack} />}
          label="previous section"
          disabled={props.page <= 0}
          onClick={() => changePage(-1)}
        />
        <PenulimateLabel page={props.page} work={props.work} />
        <NavIcon
          Icon={<SvgIcon pathD={SvgIcon.ArrowForward} />}
          label="next section"
          disabled={props.page >= props.work.pages.length - 1}
          onClick={() => changePage(1)}
        />
        <CopyLinkTooltip
          forwarded={TooltipNavIcon}
          message="Copy link to page"
          link={window.location.href}
          placement="bottom"
        />
      </div>
      <div
        style={{
          lineHeight: props.isMobile ? 1 : undefined,
          paddingTop: props.isMobile ? "8px" : undefined,
        }}>
        <HeaderText data={props.work} page={props.page} />
      </div>
    </>
  );
}

export function WorkTextPage(props: {
  work: PaginatedWork;
  setDictWord: (word: string) => unknown;
  page: number;
  textScale: number;
  isMobile: boolean;
}) {
  const { textScale, isMobile, work } = props;
  const { section, queryLine } = React.useContext(ReaderContext);
  if (section === undefined) {
    return <InfoText text="Invalid page!" />;
  }

  const gapSize = (textScale / 100) * 0.65;
  const gap = `${gapSize}em`;
  const hasLines = work.textParts.slice(-1)[0].toLowerCase() === "line";
  const hasHeader = section.header !== undefined;

  return (
    <div
      style={{
        display: "inline-grid",
        columnGap: gap,
        marginTop: isMobile ? `${gapSize / 2}em` : gap,
      }}>
      {hasHeader && (
        <span className="text sm light" style={{ gridColumn: 2, gridRow: 1 }}>
          {section.header}
        </span>
      )}
      {getWorkNodes(section).map((chunk, i) => (
        <WorkChunk
          key={chunk.id.join(".")}
          node={chunk}
          setDictWord={props.setDictWord}
          i={i + (hasHeader ? 1 : 0)}
          chunkArrayIndex={i}
          workName={capitalizeWords(props.work.info.title)}
          hideHeaderByDefault={
            hasLines && (isMobile ? i % 2 !== 0 : i !== 0 && (i + 1) % 5 !== 0)
          }
          isMobile={isMobile}
          highlight={queryLine === i}
        />
      ))}
    </div>
  );
}

function InfoLine(props: { value: string; label: string }) {
  return (
    <div>
      <SettingsText message={`${props.label}: ${props.value}`} />
    </div>
  );
}

function WorkNavigation(props: {
  work: PaginatedWork;
  root: ProcessedWorkNode;
  level: number;
}) {
  const { nav } = Router.useRouter();
  const ofLevel = findWorksByLevel(props.level, props.root);

  if (ofLevel.length === 0) {
    return <></>;
  }

  const isTerminal = props.level > props.work.textParts.length - 2;
  return (
    <>
      {ofLevel.map((childRoot) => (
        <div
          key={childRoot.id.join(".")}
          style={{ marginLeft: `${props.level * 8}px` }}>
          {isTerminal ? (
            <div style={{ paddingLeft: "8px" }}>
              <span
                className="text sm terminalNavItem"
                onClick={() => {
                  for (let i = 0; i < props.work.pages.length; i++) {
                    const page = props.work.pages[i];
                    if (page.id.join(".") === childRoot.id.join(".")) {
                      // Nav pages are 1-indexed.
                      nav.to((old) => ({
                        path: old.path,
                        params: { q: `${i + 1}` },
                      }));
                    }
                  }
                }}>
                {labelForId(childRoot.id, props.work)}
              </span>
            </div>
          ) : (
            <details>
              <summary>
                <SettingsText message={labelForId(childRoot.id, props.work)} />
              </summary>
              <WorkNavigation
                work={props.work}
                root={childRoot}
                level={props.level + 1}
              />
            </details>
          )}
        </div>
      ))}
    </>
  );
}

function NumberInput(props: {
  onEnter: (input: number) => unknown;
  label: string;
}) {
  const [value, setValue] = useState<number | undefined>(undefined);
  return (
    <input
      style={{ maxWidth: "48px", borderRadius: "4px" }}
      className="bgColor text"
      aria-label={props.label}
      value={value ?? ""}
      onChange={(e) => {
        const entered = e.target.value;
        if (entered.length === 0) {
          setValue(undefined);
          return;
        }
        if (/^\d+$/.test(entered)) {
          setValue(parseInt(entered));
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" && value !== undefined) {
          props.onEnter(value);
        }
      }}
    />
  );
}

function WorkNavigationSection(props: { work: PaginatedWork }) {
  const { nav } = Router.useRouter();
  const sectionName = props.work.textParts.slice(-2)[0].toLowerCase();
  return (
    <div style={{ marginTop: "2px" }}>
      <div className="text sm light">
        <span>
          Jump to {props.work.textParts.slice(-1)[0].toLowerCase()} in current{" "}
          {sectionName}
        </span>
        {"  "}
        <NumberInput
          label="jump to section"
          onEnter={(l) =>
            nav.to((old) => ({
              ...old,
              params: {
                pg: old.params?.pg ?? old.params?.q,
                l: `${l - 1}`,
              },
            }))
          }
        />
      </div>
      <details open>
        <summary>
          <SettingsText
            message={`Browse ${sectionName}s of ${props.work.info.title}`}
          />
        </summary>
        <WorkNavigation root={props.work.root} work={props.work} level={1} />
      </details>
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
  chunkArrayIndex: number;
  latent?: boolean;
  highlighted?: boolean;
}) {
  const { hasTooltip } = React.useContext(ReaderContext);
  const { route } = Router.useRouter();

  const url = RouteInfo.toLink(
    {
      path: route.path,
      params: { ...route.params, l: props.chunkArrayIndex.toString() },
    },
    true
  );

  return (
    <CopyLinkTooltip
      forwarded={React.forwardRef<HTMLSpanElement>(
        workSectionHeader(props.text, props.latent, props.highlighted)
      )}
      message={props.blurb}
      placement="right"
      link={url}
      visibleListener={(visible) => {
        hasTooltip.current[props.chunkArrayIndex] = visible;
      }}
    />
  );
}

function WorkChunk(props: {
  node: ProcessedWorkNode;
  setDictWord: (word: string) => unknown;
  i: number;
  chunkArrayIndex: number;
  workName: string;
  hideHeaderByDefault?: boolean;
  isMobile: boolean;
  highlight?: boolean;
}) {
  const { highlightRef } = React.useContext(ReaderContext);
  const { isMobile, node } = props;
  const id = node.id
    .map((idPart) =>
      safeParseInt(idPart) !== undefined
        ? idPart
        : capitalizeWords(idPart.substring(0, isMobile ? 2 : 3))
    )
    .join(".");
  const row = props.i + 1;
  const content = props.node.children.filter(instanceOf(XmlNode));
  assertEqual(content.length, props.node.children.length);
  const shouldHighlight = props.highlight === true;
  const showHeader = shouldHighlight || props.hideHeaderByDefault !== true;
  const indent = node.rendNote === "indent";
  return (
    <>
      <span
        style={{ gridColumn: 1, gridRow: row }}
        ref={props.highlight ? highlightRef : undefined}>
        <WorkChunkHeader
          text={node.id.slice(isMobile && node.id.length > 2 ? 2 : 0).join(".")}
          chunkArrayIndex={props.chunkArrayIndex}
          blurb={`${props.workName} ${id}`}
          latent={!showHeader}
          highlighted={shouldHighlight}
        />
      </span>
      <span
        style={{
          gridColumn: 2,
          gridRow: row,
          paddingLeft: indent ? "16px" : undefined,
        }}
        id={id}>
        {content.map((node, i) =>
          displayForLibraryChunk(node, props.setDictWord, i)
        )}
        {"\n" /* Add a newline so copy / paste works correctly on Firefox. */}
      </span>
    </>
  );
}

function LatLink(props: {
  word: string;
  setDictWord: (input: string) => unknown;
  target?: string;
}) {
  const { hasTooltip } = React.useContext(ReaderContext);
  return (
    <span
      className="workLatWord"
      onClick={(e) => {
        if (hasTooltip.current.some((v) => v)) {
          return;
        }
        props.setDictWord(props.target || props.word);
        e.stopPropagation();
      }}>
      {props.word}
    </span>
  );
}

function displayForLibraryChunk(
  root: XmlNode,
  setDictWord: (word: string) => unknown,
  key?: number
): JSX.Element {
  const children = root.children.map((child, i) => {
    if (typeof child === "string") {
      return child;
    }
    return displayForLibraryChunk(child, setDictWord, i);
  });
  if (root.name === "libLat") {
    const word = XmlNode.assertIsString(root.children[0]);
    return (
      <LatLink
        word={word}
        setDictWord={setDictWord}
        key={key}
        target={root.getAttr("target")}
      />
    );
  }
  const alt = root.getAttr("alt");
  if (alt === "gap") {
    return React.createElement("span", { key: key }, [" [gap]"]);
  }
  // TODO: This is kind of a hack for Juvenal, because it has <note> elements
  // that split up text, but we ignore whitespace in the processing so something
  // like `foo<note>...</note> bar` would ignore the space before `bar`.
  // Ideally we should be smarter about how we handle whitespace.
  if (alt === "note") {
    return React.createElement("span", { key: key }, [" "]);
  }
  if (alt === "q" || alt === "quote") {
    return React.createElement("span", { key: key }, ["'", ...children, "'"]);
  }
  return React.createElement("span", { key: key }, children);
}
