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
import { callApi } from "@/web/utils/rpc/client_rpc";
import React, { CSSProperties, useContext, useEffect, useState } from "react";
import IconButton from "@mui/material/IconButton";
import { safeParseInt } from "@/common/misc_utils";
import Typography from "@mui/material/Typography";
import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { usePersistedNumber } from "@/web/client/pages/library/persisted_settings";
import Slider from "@mui/material/Slider";
import { debounce } from "@mui/material/utils";
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

interface SidebarState {
  dictWord?: string;
  settings?: true;
}

export function ReadingPage() {
  const [sidebar, setSidebar] = React.useState<SidebarState>({});
  const [textWidth, setTextWidth] = usePersistedNumber(56, "READER_WORK_WIDTH");
  const [workScale, setWorkScale] = usePersistedNumber(100, "RD_WORK_SCALE");
  const [dictScale, setDictScale] = usePersistedNumber(90, "RD_DICT_SCALE");

  return (
    <div style={CONTAINER_STYLE}>
      <div
        style={{
          ...COLUMN_STYLE,
          width: `${textWidth}%`,
          paddingLeft: 4,
          paddingRight: 8,
        }}
      >
        <WorkColumn
          setDictWord={(word) => setSidebar({ dictWord: word })}
          showSettings={() => setSidebar({ settings: true })}
          textScale={workScale}
        />
      </div>
      <div
        style={{ ...COLUMN_STYLE, width: `${96 - textWidth}%`, paddingTop: 12 }}
      >
        <ContentBox isSmall={true}>
          <>
            {sidebar.dictWord !== undefined ? (
              <DictionaryViewV2
                embedded={true}
                initial={sidebar.dictWord}
                textScale={dictScale}
              />
            ) : sidebar.settings === true ? (
              <>
                <div>Reader settings</div>
                <SettingSlider
                  value={textWidth}
                  setValue={setTextWidth}
                  label="Main text width"
                  min={24}
                  max={80}
                  step={8}
                />
                <SettingSlider
                  value={workScale}
                  setValue={setWorkScale}
                  label="Main text size"
                  min={50}
                  max={150}
                  step={10}
                />
                <SettingSlider
                  value={dictScale}
                  setValue={setDictScale}
                  label="Sidebar text size"
                  min={50}
                  max={150}
                  step={10}
                />
              </>
            ) : (
              <InfoText text="Click on a word for dictionary and inflection lookups." />
            )}
          </>
        </ContentBox>
      </div>
    </div>
  );
}

function SettingSlider(props: {
  value: number;
  setValue: (w: number) => any;
  label: string;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div>
      <InfoText text={props.label} />
      <div style={{ paddingLeft: 12, paddingRight: 12 }}>
        <Slider
          aria-label={props.label}
          size="small"
          getAriaValueText={(v) => `${v}`}
          value={props.value}
          onChange={debounce((_, newValue) => {
            if (typeof newValue !== "number") {
              return;
            }
            props.setValue(newValue);
          })}
          valueLabelDisplay="off"
          step={props.step}
          marks
          min={props.min}
          max={props.max}
          style={{ width: 150 }}
        />
      </div>
    </div>
  );
}

type PaginatedWork = ProcessedWork & { pageStarts: number[]; pages: number };
type WorkState = PaginatedWork | "Loading" | "Error";

function WorkColumn(props: {
  setDictWord: (word: string | undefined) => any;
  showSettings: () => any;
  textScale: number;
}) {
  const nav = useContext(RouteContext);
  const [work, setWork] = useState<WorkState>("Loading");
  const [currentPage, setCurrentPage] = useState<number>(-1);

  function setUrl(newPage: number) {
    // +1 so that the entry page is 0 and the other pages are 1-indexed.
    Navigation.query(nav, `${newPage + 1}`, { localOnly: true });
  }

  function setPage(newPage: number) {
    setUrl(newPage);
    setCurrentPage(newPage);
  }

  useEffect(() => {
    const id = nav.route.path.substring(WORK_PAGE.length + 1);
    const urlPage = safeParseInt(nav.route.query);
    // -1 because we add 1 when setting the page.
    const newPage = urlPage === undefined ? currentPage : urlPage - 1;
    setCurrentPage(newPage);
    if (urlPage === undefined) {
      setUrl(newPage);
    }
    callApi(GetWork, id)
      .then((work) => setWork(dividePages(work)))
      .catch((reason) => {
        console.debug(reason);
        setWork("Error");
      });
  }, []);

  return (
    <ContentBox isSmall={true} textScale={props.textScale}>
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
            showSettings={props.showSettings}
            textScale={props.textScale}
          />
          <WorkTextPage
            work={work}
            setDictWord={props.setDictWord}
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
      fontSize={FontSizes.TERTIARY * ((props.textScale || 100) / 100)}
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
    .slice(0, -1);
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

function WorkNavigation(props: {
  page: number;
  setPage: (to: number) => any;
  work: PaginatedWork;
  showSettings: () => any;
  textScale?: number;
}) {
  return (
    <div>
      <div>
        <NavIcon
          Icon={<ArrowBack />}
          label="previous section"
          onClick={() => props.setPage(Math.max(-1, props.page - 1))}
        />
        <NavIcon
          Icon={<ArrowForward />}
          label="next section"
          onClick={() =>
            props.setPage(Math.min(props.page + 1, props.work.pages))
          }
        />
        <CopyLinkTooltip
          forwarded={React.forwardRef<any>(function TooltipNavIcon(
            fProps,
            fRef
          ) {
            return (
              <span {...fProps} ref={fRef}>
                <NavIcon Icon={<LinkIcon />} label="link to section" />
              </span>
            );
          })}
          message="Copy link to section"
          link={window.location.href}
        />

        <NavIcon
          Icon={<DisplaySettings />}
          label="Reader settings"
          onClick={() => {
            console.log("Settings clicked!");
            props.showSettings();
          }}
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
  textScale?: number;
}) {
  if (props.page === -1) {
    return <WorkInfo workInfo={props.work.info} />;
  }

  const i = props.work.pageStarts[props.page];
  const j = props.work.pageStarts[props.page + 1];
  const chunksToShow = props.work.chunks.slice(i, j);

  return (
    <>
      {chunksToShow.map((chunk) => (
        <WorkChunk
          key={chunk[0].join(",")}
          parts={props.work.textParts}
          id={chunk[0]}
          textRoot={chunk[1]}
          setDictWord={props.setDictWord}
          textScale={props.textScale}
        />
      ))}
    </>
  );
}

function WorkInfo(props: { workInfo: DocumentInfo }) {
  return (
    <>
      <div>{props.workInfo.title}</div>
      <div>{props.workInfo.author}</div>
      {props.workInfo.editor && <div>{props.workInfo.editor}</div>}
      {props.workInfo.funder && <div>{props.workInfo.funder}</div>}
      {props.workInfo.sponsor && <div>{props.workInfo.sponsor}</div>}
    </>
  );
}

function WorkChunk(props: {
  parts: string[];
  id: number[];
  textRoot: XmlNode;
  setDictWord: (word: string | undefined) => any;
  textScale?: number;
}) {
  const id = `${props.parts.slice(-1)[0]} ${props.id.slice(-1)[0]}`;
  return (
    <div style={{ paddingTop: 8 }}>
      <div>
        <InfoText
          text={capitalizeWords(id)}
          style={{ marginLeft: 0 }}
          textScale={props.textScale}
        />
      </div>
      {displayForLibraryChunk(props.textRoot, props.setDictWord)}
    </div>
  );
}

function LatLink(props: { word: string; setDictWord: (input: string) => any }) {
  return (
    <span className="latWord" onClick={() => props.setDictWord(props.word)}>
      {props.word}
    </span>
  );
}

function displayForLibraryChunk(
  root: XmlNode,
  setDictWord: (word: string | undefined) => any
): JSX.Element {
  const children = root.children.map((child) => {
    if (typeof child === "string") {
      return child;
    }
    return displayForLibraryChunk(child, setDictWord);
  });
  if (root.name === "libLat") {
    const word = XmlNode.assertIsString(root.children[0]);
    return <LatLink word={word} setDictWord={setDictWord} />;
  }
  return React.createElement(root.name, {}, children);
}
