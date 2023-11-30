import { DocumentInfo, ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { GetWork } from "@/web/api_routes";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import { callApi } from "@/web/utils/rpc/client_rpc";
import Stack from "@mui/material/Stack";
import React, { CSSProperties, useContext, useEffect, useState } from "react";
import IconButton from "@mui/material/IconButton";
import { safeParseInt } from "@/common/misc_utils";

const TOC_SIDEBAR_STYLE: CSSProperties = {
  position: "sticky",
  zIndex: 1,
  top: 0,
  left: 0,
  marginTop: 10,
  overflow: "auto",
  maxHeight: window.innerHeight - 40,
  minWidth: "50%",
};

function Placeholder() {
  return (
    <span key={"horizonatalSpacePlaceholder"} className="dictPlaceholder">
      {"pla ceh old er".repeat(20)}
    </span>
  );
}

export function ReadingPage() {
  const [dictWord, setDictWord] = React.useState<string | undefined>();

  return (
    <Stack direction="row" spacing={0} justifyContent="left">
      <div style={{ maxWidth: "10000px" }}>
        <ContentBox isSmall={false}>
          <>
            {dictWord ? (
              <DictionaryViewV2 embedded={true} initial={dictWord} />
            ) : (
              <div>Click on a word for dictionary and inflection lookups.</div>
            )}
            <Placeholder />
          </>
        </ContentBox>
      </div>
      <div style={TOC_SIDEBAR_STYLE}>
        <WorkColumn setDictWord={setDictWord} />
      </div>
    </Stack>
  );
}

type PaginatedWork = ProcessedWork & { pageStarts: number[] };
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
    <ContentBox isSmall={false}>
      {work === "Loading" ? (
        <span>{`Loading, please wait`}</span>
      ) : work === "Error" ? (
        <span>
          An error occurred - either the work is invalid or there could be a
          server error
        </span>
      ) : (
        <>
          <WorkNavigation page={currentPage} setPage={setPage} />
          <WorkTextPage
            work={work}
            setDictWord={props.setDictWord}
            page={currentPage}
          />
          <Placeholder />
        </>
      )}
    </ContentBox>
  );
}

function WorkNavigation(props: { page: number; setPage: (to: number) => any }) {
  return (
    <div>
      <IconButton
        size="large"
        aria-label="previous section"
        onClick={() => props.setPage(props.page - 1)}
        className="menuIcon"
      >
        <ArrowBack />
      </IconButton>
      <IconButton
        size="large"
        aria-label="next section"
        onClick={() => props.setPage(props.page + 1)}
        className="menuIcon"
      >
        <ArrowForward />
      </IconButton>
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
  return { ...work, pageStarts };
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
  const id = props.parts
    .map((partName, i) => `${partName} ${props.id[i]}`)
    .join(", ");
  return (
    <div>
      <div>{id}</div>
      {displayForLibraryChunk(props.textRoot, props.setDictWord)}
      <br />
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
