import { DocumentInfo, ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { GetWork } from "@/web/api_routes";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import LinkIcon from "@mui/icons-material/Link";
import DisplaySettings from "@mui/icons-material/DisplaySettings";
import MenuBook from "@mui/icons-material/MenuBookOutlined";
import Info from "@mui/icons-material/Info";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { CSSProperties, useContext, useEffect, useState } from "react";
import * as React from "react";
import IconButton from "@mui/material/IconButton";
import { exhaustiveGuard, safeParseInt } from "@/common/misc_utils";
import Typography from "@mui/material/Typography";
import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import Slider from "@mui/material/Slider";
import { debounce } from "@mui/material/utils";
import { FontSizes } from "@/web/client/styles";
import Container from "@mui/material/Container";

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
// Styles for the top bar
// style={{
//   position: "sticky",
//   top: 0,
//   width: "100%",
//   backgroundColor: "green",
// }
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

interface SidebarState {
  dictWord?: string;
  panel: "Info" | "Dict" | "Settings";
}

function SettingsText(props: {
  message: string;
  size?: number;
  scale: number;
}) {
  return (
    <Typography
      component="span"
      className="contentTextLight"
      fontSize={
        (props.size || FontSizes.BIG_SCREEN) * ((props.scale || 100) / 100)
      }
    >
      {props.message}
    </Typography>
  );
}

function SettingSlider(props: {
  value: number;
  setValue: (w: number) => any;
  label: string;
  min: number;
  max: number;
  step: number;
  tag?: string;
  scale: number;
  disableLabels?: boolean;
}) {
  const scale = props.scale / 100;
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
      }}
    >
      <SettingsText
        message={props.label}
        size={FontSizes.SECONDARY}
        scale={props.scale}
      />
      <Slider
        aria-label={(props.tag || "") + " " + props.label}
        size="small"
        getAriaValueText={(v) => `${v}`}
        value={props.value}
        onChange={debounce((_, newValue) => {
          if (typeof newValue !== "number") {
            return;
          }
          props.setValue(newValue);
        })}
        valueLabelDisplay={props.disableLabels ? "off" : "auto"}
        step={props.step}
        marks
        min={props.min}
        max={props.max}
        style={{
          width: 250 * scale,
          marginLeft: 12 * scale,
          marginRight: 12 * scale,
        }}
      />
    </div>
  );
}

function Sidebar(props: {
  workInfo?: DocumentInfo;
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
        />
      );
    case "Info":
      return (
        <>
          <WorkInfo workInfo={props.workInfo} scale={props.scale} />
          <div>TODO: Add Navigation</div>
        </>
      );
    default:
      exhaustiveGuard(sidebar.panel);
  }
}

function setUrl(nav: Navigation, newPage: number) {
  // +1 so that the entry page is 0 and the other pages are 1-indexed.
  Navigation.query(nav, `${newPage + 1}`, { localOnly: true });
}

export function ReadingPage() {
  const [sidebar, setSidebar] = React.useState<SidebarState>({ panel: "Dict" });
  const [totalWidth, setTotalWidth] = usePersistedNumber(1, "RD_TOTAL_WIDTH");
  const [mainWidth, setMainWidth] = usePersistedNumber(56, "RD_WORK_WIDTH");
  const [workScale, setWorkScale] = usePersistedNumber(100, "RD_WORK_SCALE");
  const [dictScale, setDictScale] = usePersistedNumber(90, "RD_DICT_SCALE");

  const [currentPage, setCurrentPage] = useState<number>(0);
  const [work, setWork] = useState<WorkState>("Loading");
  const nav = useContext(RouteContext);

  useEffect(() => {
    const id = nav.route.path.substring(WORK_PAGE.length + 1);
    const urlPage = safeParseInt(nav.route.query);
    // -1 because we add 1 when setting the page.
    const newPage = urlPage === undefined ? currentPage : urlPage - 1;
    setCurrentPage(newPage);
    if (urlPage === undefined) {
      setUrl(nav, newPage);
    }
    callApi(GetWork, id)
      .then((work) => setWork(dividePages(work)))
      .catch((reason) => {
        console.debug(reason);
        setWork("Error");
      });
  }, []);

  return (
    <Container maxWidth={WIDTH_LOOKUP[totalWidth]} style={CONTAINER_STYLE}>
      <div
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidth}%`,
          paddingLeft: 4,
          paddingRight: 8,
        }}
      >
        <WorkColumn
          setSidebar={setSidebar}
          textScale={workScale}
          work={work}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />
      </div>
      <div style={{ ...COLUMN_STYLE, width: `${96 - mainWidth}%` }}>
        <ContentBox isSmall>
          <>
            <div>
              <NavIcon
                Icon={<Info />}
                label="Work details"
                onClick={() => setSidebar({ panel: "Info" })}
              />
              <NavIcon
                Icon={<MenuBook />}
                label="Dictionary"
                onClick={() => setSidebar({ panel: "Dict" })}
              />
              <NavIcon
                Icon={<DisplaySettings />}
                label="Reader settings"
                onClick={() => setSidebar({ panel: "Settings" })}
              />
            </div>
            <Sidebar
              workInfo={typeof work === "string" ? undefined : work.info}
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
          </>
        </ContentBox>
      </div>
    </Container>
  );
}

type PaginatedWork = ProcessedWork & { pageStarts: number[]; pages: number };
type WorkState = PaginatedWork | "Loading" | "Error";

function WorkColumn(props: {
  setSidebar: (state: SidebarState) => any;
  textScale: number;
  work: WorkState;
  currentPage: number;
  setCurrentPage: (page: number) => any;
}) {
  const nav = useContext(RouteContext);

  const currentPage = props.currentPage;
  const setCurrentPage = props.setCurrentPage;
  const work = props.work;

  function setPage(newPage: number) {
    setUrl(nav, newPage);
    setCurrentPage(newPage);
  }

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
          <WorkNavigation
            page={currentPage}
            setPage={setPage}
            work={work}
            textScale={props.textScale}
          />
          <WorkTextPage
            work={work}
            setDictWord={(dictWord) =>
              props.setSidebar({ panel: "Dict", dictWord })
            }
            page={currentPage}
            textScale={props.textScale}
          />
        </>
      )}
    </ContentBox>
  );
}

function capitalizeWords(input: string): string {
  const words = input.split(" ");
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function InfoText(props: {
  text: string;
  textScale?: number;
  style?: CSSProperties;
}) {
  return (
    <Typography
      component="span"
      className="contentTextLight"
      fontSize={FontSizes.SECONDARY * ((props.textScale || 100) / 100)}
      style={{ marginLeft: 8, marginRight: 8, ...props.style }}
    >
      {props.text}
    </Typography>
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
  const parts = props.data.textParts;
  const chunkIndex = props.data.pageStarts[props.page];
  const firstChunk = props.data.chunks[chunkIndex][0];
  const idParts = parts
    .map((partName, i) => `${partName} ${firstChunk[i]}`)
    .slice(0, -2);
  return (
    <>
      {idParts.map((idPart) => (
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

function NavIcon(props: {
  label: string;
  onClick?: () => any;
  Icon: JSX.Element;
  ref?: React.ForwardedRef<any>;
}) {
  return (
    <IconButton
      ref={props.ref}
      size="small"
      aria-label={props.label}
      onClick={props.onClick}
      className="menuIcon"
    >
      {props.Icon}
    </IconButton>
  );
}

const TooltipNavIcon = React.forwardRef<any>(function TooltipNavIcon(
  fProps,
  fRef
) {
  return (
    <span {...fProps} ref={fRef}>
      <NavIcon Icon={<LinkIcon />} label="link to section" />
    </span>
  );
});

function PenulimateLabel(props: { page: number; work: PaginatedWork }) {
  const parts = props.work.textParts;
  const i = parts.length - 2;
  if (props.page < 0 || i < 0) {
    return <></>;
  }
  const chunkIndex = props.work.pageStarts[props.page];
  const firstChunk = props.work.chunks[chunkIndex][0];
  const text = capitalizeWords(`${parts[i]} ${firstChunk[i]}`);
  return <InfoText text={text} />;
}

function WorkNavigation(props: {
  page: number;
  setPage: (to: number) => any;
  work: PaginatedWork;
  textScale?: number;
}) {
  return (
    <div>
      <div>
        <NavIcon
          Icon={<ArrowBack />}
          label="previous section"
          onClick={() => props.setPage(Math.max(0, props.page - 1))}
        />
        <PenulimateLabel page={props.page} work={props.work} />
        <NavIcon
          Icon={<ArrowForward />}
          label="next section"
          onClick={() =>
            props.setPage(Math.min(props.page + 1, props.work.pages))
          }
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
    </div>
  );
}

function dividePages(work: ProcessedWork): PaginatedWork {
  const pageStarts = [];
  let lastPageIndex: number[] = work.textParts.map((_) => -1);
  for (let i = 0; i < work.chunks.length; i++) {
    const chunk = work.chunks[i];
    let matchesLast = true;
    // For now, just split on the lowest level division.
    for (let i = 0; i < lastPageIndex.length - 1; i++) {
      if (lastPageIndex[i] !== chunk[0][i]) {
        matchesLast = false;
      }
    }
    if (!matchesLast) {
      pageStarts.push(i);
      lastPageIndex = chunk[0];
    }
  }
  pageStarts.push(work.chunks.length);
  return { ...work, pageStarts, pages: pageStarts.length - 1 };
}

export function WorkTextPage(props: {
  work: PaginatedWork;
  setDictWord: (word: string | undefined) => any;
  page: number;
  textScale: number;
}) {
  const i = props.work.pageStarts[props.page];
  const j = props.work.pageStarts[props.page + 1];
  const chunksToShow = props.work.chunks.slice(i, j);
  const gap = `${(props.textScale / 100) * 0.75}em`;

  return (
    <div style={{ display: "inline-grid", columnGap: gap, marginTop: gap }}>
      {chunksToShow.map((chunk, i) => (
        <WorkChunk
          key={chunk[0].join(",")}
          id={chunk[0]}
          textRoot={chunk[1]}
          setDictWord={props.setDictWord}
          textScale={props.textScale}
          i={i}
          workName={capitalizeWords(props.work.info.title)}
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

function WorkInfo(props: { workInfo?: DocumentInfo; scale: number }) {
  if (props.workInfo === undefined) {
    return <></>;
  }

  return (
    <details>
      <summary>
        <SettingsText
          scale={props.scale}
          message={capitalizeWords(props.workInfo.title)}
        />
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
  id: number[];
  textRoot: XmlNode;
  setDictWord: (word: string | undefined) => any;
  textScale: number;
  i: number;
  workName: string;
}) {
  const id = props.id.join(".");
  const row = props.i + 1;
  return (
    <>
      <span style={{ gridColumn: 1, gridRow: row }}>
        <WorkChunkHeader
          text={id}
          textScale={props.textScale}
          blurb={`${props.workName} ${id}`}
        />
      </span>
      <span style={{ gridColumn: 2, gridRow: row }} id={id}>
        {displayForLibraryChunk(props.textRoot, props.setDictWord)}
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
  return React.createElement("span", {}, children);
}
