import {
  DocumentInfo,
  ProcessedWork,
  ProcessedWorkNode,
} from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import Settings from "@mui/icons-material/Settings";
import MenuBook from "@mui/icons-material/MenuBookOutlined";
import Info from "@mui/icons-material/Info";
import { CSSProperties, useContext, useEffect, useState } from "react";
import * as React from "react";
import { exhaustiveGuard, safeParseInt } from "@/common/misc_utils";
import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import Container from "@mui/material/Container";
import { fetchWork } from "@/web/client/pages/library/work_cache";
import {
  SettingsText,
  SettingSlider,
  InfoText,
  capitalizeWords,
  NavIcon,
  TooltipNavIcon,
} from "@/web/client/pages/library/reader_utils";
import { instanceOf } from "@/web/utils/rpc/parsing";
import { assertEqual } from "@/common/assert";
import Typography from "@mui/material/Typography";
import { FontSizes } from "@/web/client/styles";

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
const WIDTH_LOOKUP: ("lg" | "xl" | "xxl" | false)[] = [
  "lg",
  "xl",
  "xxl",
  false,
];
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

export function ReadingPage() {
  const [sidebar, setSidebar] = React.useState<SidebarState>({ panel: "Dict" });
  const [totalWidth, setTotalWidth] = usePersistedNumber(1, "RD_TOTAL_WIDTH");
  const [mainWidth, setMainWidth] = usePersistedNumber(56, "RD_WORK_WIDTH");
  const [workScale, setWorkScale] = usePersistedNumber(100, "RD_WORK_SCALE");
  const [dictScale, setDictScale] = usePersistedNumber(90, "RD_DICT_SCALE");

  const [currentPage, setCurrentPage] = useState<number>(0);
  const [work, setWork] = useState<WorkState>("Loading");

  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const nav = useContext(RouteContext);

  useEffect(() => {
    const id = nav.route.path.substring(WORK_PAGE.length + 1);
    fetchWork(id)
      .then((work) =>
        setWork({
          info: work.info,
          root: work.root,
          textParts: work.textParts,
          pages: divideWork(work),
        })
      )
      .catch((reason) => {
        console.debug(reason);
        setWork("Error");
      });
  }, [setWork, nav.route.path]);

  useEffect(() => {
    const urlPage = safeParseInt(nav.route.query);
    setCurrentPage(urlPage === undefined ? 0 : urlPage - 1);
  }, [nav.route.query]);

  return (
    <Container maxWidth={WIDTH_LOOKUP[totalWidth]} style={CONTAINER_STYLE}>
      <div
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidth}%`,
        }}
      >
        <WorkColumn
          setSidebar={(newSidebar) => {
            // @ts-ignore
            sidebarRef.current?.scroll({ top: 0, behavior: "instant" });
            setSidebar(newSidebar);
          }}
          textScale={workScale}
          work={work}
          currentPage={currentPage}
        />
      </div>
      <div
        style={{ ...COLUMN_STYLE, width: `${96 - mainWidth}%` }}
        ref={sidebarRef}
      >
        <ContentBox isSmall>
          <>
            <div className="readerIconBar">
              <NavIcon
                Icon={<Info />}
                label="Work details"
                onClick={() => setSidebar({ panel: "Info" })}
                extraClasses={
                  sidebar.panel === "Info"
                    ? ["selectedSidePanelTab"]
                    : undefined
                }
              />
              <NavIcon
                Icon={<MenuBook />}
                label="Dictionary"
                onClick={() => setSidebar({ panel: "Dict" })}
                extraClasses={
                  sidebar.panel === "Dict"
                    ? ["selectedSidePanelTab"]
                    : undefined
                }
              />
              <NavIcon
                Icon={<Settings />}
                label="Reader settings"
                onClick={() => setSidebar({ panel: "Settings" })}
                extraClasses={
                  sidebar.panel === "Settings"
                    ? ["selectedSidePanelTab"]
                    : undefined
                }
              />
            </div>
            <div style={{ paddingRight: "8px" }}>
              <Sidebar
                work={typeof work === "string" ? undefined : work}
                scale={dictScale}
                sidebar={sidebar}
                mainWidth={mainWidth}
                setMainWidth={setMainWidth}
                dictScale={dictScale}
                setDictScale={setDictScale}
                workScale={workScale}
                setWorkScale={setWorkScale}
                totalWidth={totalWidth}
                setTotalWidth={setTotalWidth}
              />
            </div>
          </>
        </ContentBox>
      </div>
    </Container>
  );
}

interface SidebarState {
  dictWord?: string;
  panel: "Info" | "Dict" | "Settings";
}

function Sidebar(props: {
  work?: PaginatedWork;
  scale: number;
  sidebar: SidebarState;
  mainWidth: number;
  setMainWidth: (x: number) => any;
  workScale: number;
  setWorkScale: (x: number) => any;
  dictScale: number;
  setDictScale: (x: number) => any;
  totalWidth: number;
  setTotalWidth: (x: number) => any;
}) {
  const scale = props.scale;
  const sidebar = props.sidebar;
  switch (sidebar.panel) {
    case "Settings":
      return (
        <>
          <details>
            <summary>
              <SettingsText message="Layout settings" scale={scale} />
            </summary>
            <SettingSlider
              value={props.totalWidth}
              setValue={props.setTotalWidth}
              label="Total width"
              min={0}
              max={3}
              step={1}
              scale={scale}
              disableLabels
            />
            <SettingSlider
              value={props.mainWidth}
              setValue={props.setMainWidth}
              label="Main width"
              min={32}
              max={80}
              step={8}
              scale={scale}
            />
          </details>
          <details>
            <summary>
              <SettingsText message="Main column settings" scale={scale} />
            </summary>
            <SettingSlider
              value={props.workScale}
              setValue={props.setWorkScale}
              label="Text size"
              tag="Main column"
              min={50}
              max={150}
              step={10}
              scale={scale}
            />
          </details>
          <details>
            <summary>
              <SettingsText message="Side column settings" scale={scale} />
            </summary>
            <SettingSlider
              value={props.dictScale}
              setValue={props.setDictScale}
              label="Text size"
              tag="Side column"
              min={50}
              max={150}
              step={10}
              scale={scale}
            />
          </details>
        </>
      );
    case "Dict":
      return sidebar.dictWord === undefined ? (
        <InfoText text="Click on a word for dictionary and inflection lookups." />
      ) : (
        <DictionaryViewV2
          embedded
          initial={sidebar.dictWord}
          textScale={props.dictScale}
          embeddedOptions={{ hideableOutline: true }}
        />
      );
    case "Info":
      return (
        <>
          {props.work?.info && (
            <WorkInfo workInfo={props.work?.info} scale={props.scale} />
          )}
          {props.work && (
            <WorkNavigationSection work={props.work} scale={props.scale} />
          )}
        </>
      );
    default:
      exhaustiveGuard(sidebar.panel);
  }
}

function WorkColumn(props: {
  setSidebar: (state: SidebarState) => any;
  textScale: number;
  work: WorkState;
  currentPage: number;
}) {
  const currentPage = props.currentPage;
  const work = props.work;

  return (
    <ContentBox isSmall textScale={props.textScale}>
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
            textScale={props.textScale}
          />
          <div style={{ paddingRight: "8px" }}>
            <WorkTextPage
              work={work}
              setDictWord={(dictWord) =>
                props.setSidebar({ panel: "Dict", dictWord })
              }
              page={currentPage}
              textScale={props.textScale}
            />
          </div>
        </>
      )}
    </ContentBox>
  );
}

function HeaderText(props: {
  data: PaginatedWork;
  page: number;
  textScale?: number;
}) {
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
        <InfoText
          text={capitalizeWords(idPart)}
          key={idPart}
          textScale={props.textScale}
        />
      ))}
      <InfoText
        text={capitalizeWords(props.data.info.title)}
        textScale={props.textScale}
      />
      <InfoText
        text={capitalizeWords(props.data.info.author)}
        textScale={props.textScale}
      />
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
  textScale?: number;
}) {
  const nav = useContext(RouteContext);

  const setPage = React.useCallback(
    // Nav pages are 1-indexed.
    (newPage: number) => Navigation.query(nav, `${newPage + 1}`),
    [nav]
  );
  const previousPage = React.useCallback(() => {
    setPage(Math.max(0, props.page - 1));
  }, [props.page, setPage]);
  const nextPage = React.useCallback(() => {
    setPage(Math.min(props.page + 1, props.work.pages.length));
  }, [props.page, setPage, props.work]);

  React.useEffect(() => {
    const keyListener = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        previousPage();
      } else if (e.key === "ArrowRight") {
        nextPage();
      }
    };
    window.addEventListener("keyup", keyListener);
    return () => window.removeEventListener("keyup", keyListener);
  }, [previousPage, nextPage]);

  return (
    <>
      <div className="readerIconBar">
        <NavIcon
          Icon={<ArrowBack />}
          label="previous section"
          disabled={props.page <= 0}
          onClick={previousPage}
        />
        <PenulimateLabel page={props.page} work={props.work} />
        <NavIcon
          Icon={<ArrowForward />}
          label="next section"
          disabled={props.page >= props.work.pages.length - 1}
          onClick={nextPage}
        />
        <CopyLinkTooltip
          forwarded={TooltipNavIcon}
          message="Copy link to page"
          link={window.location.href}
        />
      </div>
      <div>
        <HeaderText
          data={props.work}
          page={props.page}
          textScale={props.textScale}
        />
      </div>
    </>
  );
}

export function WorkTextPage(props: {
  work: PaginatedWork;
  setDictWord: (word: string | undefined) => any;
  page: number;
  textScale: number;
}) {
  const section = findSectionById(
    props.work.pages[props.page].id,
    props.work.root
  );
  if (section === undefined) {
    return <InfoText text="Invalid page!" textScale={props.textScale} />;
  }

  const gap = `${(props.textScale / 100) * 0.75}em`;
  const hasLines = props.work.textParts.slice(-1)[0].toLowerCase() === "line";
  const hasHeader = section.header !== undefined;

  return (
    <div style={{ display: "inline-grid", columnGap: gap, marginTop: gap }}>
      {hasHeader && (
        <span
          className="contentTextLight"
          style={{
            gridColumn: 2,
            gridRow: 1,
            fontSize: FontSizes.SECONDARY * ((props.textScale || 100) / 100),
          }}
        >
          {section.header}
        </span>
      )}
      {getWorkNodes(section).map((chunk, i) => (
        <WorkChunk
          key={chunk.id.join(".")}
          node={chunk}
          setDictWord={props.setDictWord}
          textScale={props.textScale}
          i={i + (hasHeader ? 1 : 0)}
          workName={capitalizeWords(props.work.info.title)}
          hideHeader={hasLines && i !== 0 && (i + 1) % 5 !== 0}
        />
      ))}
    </div>
  );
}

function InfoLine(props: { value: string; label: string; scale: number }) {
  return (
    <div>
      <SettingsText
        scale={props.scale}
        message={`${props.label}: ${props.value}`}
      />
    </div>
  );
}

function WorkNavigation(props: {
  work: PaginatedWork;
  root: ProcessedWorkNode;
  scale: number;
  level: number;
}) {
  const nav = useContext(RouteContext);
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
          style={{ marginLeft: `${props.level * 8}px` }}
        >
          {isTerminal ? (
            <div style={{ paddingLeft: "8px" }}>
              <Typography
                component="span"
                className="terminalNavItem"
                fontSize={FontSizes.BIG_SCREEN * ((props.scale || 100) / 100)}
                onClick={() => {
                  for (let i = 0; i < props.work.pages.length; i++) {
                    const page = props.work.pages[i];
                    if (page.id.join(".") === childRoot.id.join(".")) {
                      // Nav pages are 1-indexed.
                      Navigation.query(nav, `${i + 1}`);
                    }
                  }
                }}
              >
                {labelForId(childRoot.id, props.work)}
              </Typography>
            </div>
          ) : (
            <details>
              <summary>
                <SettingsText
                  scale={props.scale}
                  message={labelForId(childRoot.id, props.work)}
                />
              </summary>
              <WorkNavigation
                work={props.work}
                root={childRoot}
                scale={props.scale}
                level={props.level + 1}
              />
            </details>
          )}
        </div>
      ))}
    </>
  );
}

function WorkNavigationSection(props: { work: PaginatedWork; scale: number }) {
  return (
    <details open>
      <summary>
        <SettingsText scale={props.scale} message={props.work.info.title} />
      </summary>
      <WorkNavigation
        root={props.work.root}
        scale={props.scale}
        work={props.work}
        level={1}
      />
    </details>
  );
}

function WorkInfo(props: { workInfo: DocumentInfo; scale: number }) {
  return (
    <details>
      <summary>
        <SettingsText scale={props.scale} message={"Attribution"} />
      </summary>
      <InfoLine
        label="Author"
        value={props.workInfo.author}
        scale={props.scale}
      />
      {props.workInfo.editor && (
        <InfoLine
          label="Editor"
          value={props.workInfo.editor}
          scale={props.scale}
        />
      )}
      {props.workInfo.funder && (
        <InfoLine
          label="Funder"
          value={props.workInfo.funder}
          scale={props.scale}
        />
      )}
      {props.workInfo.sponsor && (
        <InfoLine
          label="Sponsor"
          value={props.workInfo.sponsor}
          scale={props.scale}
        />
      )}
    </details>
  );
}

function workSectionHeader(
  text: string,
  textScale: number
): React.ForwardRefRenderFunction<HTMLSpanElement, object> {
  return function InternalWorkSectionHeader(fProps, fRef) {
    return (
      <span {...fProps} ref={fRef}>
        <InfoText
          text={text}
          style={{ marginLeft: 0, marginRight: 0, cursor: "pointer" }}
          additionalClasses={["unselectable"]}
          textScale={textScale}
        />
      </span>
    );
  };
}

function WorkChunkHeader(props: {
  text: string;
  textScale: number;
  blurb: string;
}) {
  return (
    <CopyLinkTooltip
      forwarded={React.forwardRef<HTMLSpanElement>(
        workSectionHeader(props.text, props.textScale)
      )}
      message={props.blurb}
      link={`${props.blurb}\n${window.location.href}`}
    />
  );
}

function WorkChunk(props: {
  node: ProcessedWorkNode;
  setDictWord: (word: string | undefined) => any;
  textScale: number;
  i: number;
  workName: string;
  hideHeader?: boolean;
}) {
  const id = props.node.id
    .map((idPart) =>
      safeParseInt(idPart) !== undefined
        ? idPart
        : capitalizeWords(idPart.substring(0, 3))
    )
    .join(".");
  const row = props.i + 1;
  const content = props.node.children.filter(instanceOf(XmlNode));
  assertEqual(content.length, props.node.children.length);
  const showHeader = props.hideHeader !== true;
  return (
    <>
      {showHeader && (
        <span style={{ gridColumn: 1, gridRow: row }}>
          <WorkChunkHeader
            text={id}
            textScale={props.textScale}
            blurb={`${props.workName} ${id}`}
          />
        </span>
      )}
      <span style={{ gridColumn: 2, gridRow: row }} id={id}>
        {content.map((node, i) =>
          displayForLibraryChunk(node, props.setDictWord, i)
        )}
      </span>
    </>
  );
}

function LatLink(props: { word: string; setDictWord: (input: string) => any }) {
  return (
    <span className="workLatWord" onClick={() => props.setDictWord(props.word)}>
      {props.word}
    </span>
  );
}

function displayForLibraryChunk(
  root: XmlNode,
  setDictWord: (word: string | undefined) => any,
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
    return <LatLink word={word} setDictWord={setDictWord} key={key} />;
  }
  if (root.getAttr("alt") === "gap") {
    return React.createElement("span", { key: key }, [" [gap]"]);
  }
  return React.createElement("span", { key: key }, children);
}
