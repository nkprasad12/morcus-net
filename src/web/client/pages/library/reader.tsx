import { DocumentInfo, ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { GetWork } from "@/web/api_routes";
import { RouteContext } from "@/web/client/components/router";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { callApi } from "@/web/utils/rpc/client_rpc";
import Stack from "@mui/material/Stack";
import React, { CSSProperties, useContext, useEffect, useState } from "react";

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
        <WorkUi setDictWord={setDictWord} />
      </div>
    </Stack>
  );
}

type WorkState = ProcessedWork | "Loading" | "Error";

export function WorkUi(props: {
  setDictWord: (word: string | undefined) => any;
}) {
  const nav = useContext(RouteContext);
  const [work, setWork] = useState<WorkState>("Loading");

  useEffect(() => {
    const id = nav.route.path.substring(WORK_PAGE.length + 1);
    callApi(GetWork, id)
      .then(setWork)
      .catch((reason) => {
        console.debug(reason);
        setWork("Error");
      });
  }, []);

  return (
    <div>
      {work === "Loading" ? (
        "Loading..."
      ) : work === "Error" ? (
        "An error occurred."
      ) : (
        <WorkText work={work} setDictWord={props.setDictWord} />
      )}
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
