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

export function ReadingPage() {
  const [dictWord, setDictWord] = React.useState<string | undefined>();

  return (
    <div style={CONTAINER_STYLE}>
      <div style={{ ...COLUMN_STYLE, paddingLeft: 4, paddingRight: 8 }}>
        <WorkColumn setDictWord={setDictWord} />
      </div>
      <div style={{ ...COLUMN_STYLE, paddingTop: 12 }}>
        <ContentBox isSmall={true}>
          <>
            {dictWord ? (
              <DictionaryViewV2 embedded={true} initial={dictWord} />
            ) : (
              <InfoText text="Click on a word for dictionary and inflection lookups." />
            )}
          </>
        </ContentBox>
      </div>
    </div>
  );
}

type PaginatedWork = ProcessedWork & { pageStarts: number[]; pages: number };
type WorkState = PaginatedWork | "Loading" | "Error";

function WorkColumn(props: { setDictWord: (word: string | undefined) => any }) {
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
    <ContentBox isSmall={true}>
      {work === "Loading" ? (
        <span>{`Loading, please wait`}</span>
      ) : work === "Error" ? (
        <span>
          An error occurred - either the work is invalid or there could be a
          server error
        </span>
      ) : (
        <>
          <WorkNavigation page={currentPage} setPage={setPage} work={work} />
          <WorkTextPage
            work={work}
            setDictWord={props.setDictWord}
            page={currentPage}
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

function InfoText(props: { text: string; style?: CSSProperties }) {
  return (
    <Typography
      component="span"
      className="contentTextLight"
      fontSize={16}
      style={{ marginLeft: 8, marginRight: 8, ...props.style }}
    >
      {props.text}
    </Typography>
  );
}

function HeaderText(props: { data: PaginatedWork; page: number }) {
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
        <InfoText text={capitalizeWords(idPart)} key={idPart} />
      ))}
      <InfoText text={capitalizeWords(props.data.info.title)} />
      <InfoText text={capitalizeWords(props.data.info.author)} />
    </>
  );
}

function NavIcon(props: {
  label: string;
  onClick: () => any;
  Icon: JSX.Element;
}) {
  return (
    <IconButton
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
        <NavIcon
          Icon={<LinkIcon />}
          label="link to section"
          onClick={() => {}}
        />
        <NavIcon
          Icon={<DisplaySettings />}
          label="display settings"
          onClick={() => {}}
        />
      </div>
      <div>
        <HeaderText data={props.work} page={props.page} />
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
}) {
  const id = `${props.parts.slice(-1)[0]} ${props.id.slice(-1)[0]}`;
  return (
    <div style={{ paddingTop: 8 }}>
      <div>
        <InfoText text={capitalizeWords(id)} style={{ marginLeft: 0 }} />
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
