import {
  DocumentInfo,
  LibraryWorkMetadata,
  ProcessedWork,
} from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { GetWork, ListLibraryWorks } from "@/web/api_routes";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { callApi } from "@/web/utils/rpc/client_rpc";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import React, { CSSProperties, useEffect, useState } from "react";

const TOC_SIDEBAR_STYLE: CSSProperties = {
  position: "sticky",
  zIndex: 1,
  top: 0,
  left: 0,
  marginTop: 10,
  overflow: "auto",
  maxHeight: window.innerHeight - 40,
  minWidth: "60%",
};

export function Library() {
  const [works, setWorks] = React.useState<LibraryWorkMetadata[] | undefined>(
    undefined
  );
  const [currentWork, setCurrentWork] = React.useState<string | undefined>(
    undefined
  );
  const [dictWord, setDictWord] = React.useState<string | undefined>();

  useEffect(() => {
    callApi(ListLibraryWorks, true).then(setWorks);
  }, []);

  function WorksList() {
    if (works === undefined) {
      return <span>Loading titles ...</span>;
    }
    return (
      <div>
        {works.map((work) => (
          <span
            key={work.id}
            className="latWork"
            style={{ paddingLeft: 8 }}
            onClick={() => setCurrentWork(work.id)}
          >{`${work.name} [${work.author}]`}</span>
        ))}
      </div>
    );
  }

  return (
    <Container maxWidth="xxl" sx={{ paddingTop: 3 }}>
      <ContentBox isSmall={false}>
        <>
          <span>Welcome to the library.</span>
          <WorksList />
        </>
      </ContentBox>
      {currentWork && (
        <ReadingPage
          workId={currentWork}
          dictWord={dictWord}
          setDictWord={setDictWord}
        />
      )}
    </Container>
  );
}

export function ReadingPage(props: {
  workId: string;
  dictWord: string | undefined;
  setDictWord: (word: string | undefined) => any;
}) {
  return (
    <div>
      <Stack direction="row" spacing={0} justifyContent="left">
        <div style={{ maxWidth: "10000px" }}>
          <ContentBox isSmall={false}>
            <>
              {props.dictWord ? (
                <DictionaryViewV2 embedded={true} initial={props.dictWord} />
              ) : (
                <div>
                  Click on a word for dictionary and inflection lookups.
                </div>
              )}
              <span
                key={"horizonatalSpacePlaceholder"}
                className="dictPlaceholder"
              >
                {"pla ceh old er".repeat(20)}
              </span>
            </>
          </ContentBox>
        </div>
        <div style={TOC_SIDEBAR_STYLE}>
          <WorkUi workdId={props.workId} setDictWord={props.setDictWord} />
        </div>
      </Stack>
    </div>
  );
}

export function WorkUi(props: {
  workdId: string;
  setDictWord: (word: string | undefined) => any;
}) {
  const [work, setWork] = useState<ProcessedWork | undefined>(undefined);

  useEffect(() => {
    callApi(GetWork, props.workdId).then(setWork);
  }, []);

  if (work === undefined) {
    return <div>Loading ...</div>;
  }

  return (
    <div>
      <WorkText work={work} setDictWord={props.setDictWord} />
    </div>
  );
}

export function WorkText(props: {
  work: ProcessedWork;
  setDictWord: (word: string | undefined) => any;
}) {
  return (
    <>
      <WorkInfo workInfo={props.work.info} />
      {props.work.chunks.map((chunk) => (
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
    <ContentBox isSmall={false}>
      <>
        <div>{props.workInfo.title}</div>
        <div>{props.workInfo.author}</div>
        {props.workInfo.editor && <div>{props.workInfo.editor}</div>}
        {props.workInfo.funder && <div>{props.workInfo.funder}</div>}
        {props.workInfo.sponsor && <div>{props.workInfo.sponsor}</div>}
      </>
    </ContentBox>
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
    <ContentBox isSmall={false}>
      <>
        <div>{id}</div>
        {displayForLibraryChunk(props.textRoot, props.setDictWord)}
      </>
    </ContentBox>
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
    function LinkContent() {
      return (
        <span className="latWord" onClick={() => setDictWord(word)}>
          {word}
        </span>
      );
    }
    return <LinkContent />;
  }
  return React.createElement(root.name, {}, children);
}
