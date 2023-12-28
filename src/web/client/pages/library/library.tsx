import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import {
  EXTERNAL_CONTENT_READER,
  WORK_PAGE,
} from "@/web/client/pages/library/common";
import { FontSizes } from "@/web/client/styles";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import Container from "@mui/material/Container";
import { useContext, useState, useEffect } from "react";

function WorksList(props: { works: undefined | LibraryWorkMetadata[] }) {
  const nav = useContext(RouteContext);

  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column" }}>
      {props.works === undefined ? (
        <span>Loading titles ...</span>
      ) : (
        props.works.map((work) => (
          <div key={work.id}>
            <span
              className="latWork"
              onClick={() => Navigation.to(nav, `${WORK_PAGE}/${work.id}`)}
              role="button">
              <span>{work.name}</span>{" "}
              <span className="contentTextLight">{work.author}</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ExternalReaderButton() {
  const nav = useContext(RouteContext);

  return (
    <span
      className="jsLink"
      onClick={() => Navigation.to(nav, EXTERNAL_CONTENT_READER)}>
      here
    </span>
  );
}

export function Library() {
  const [works, setWorks] = useState<LibraryWorkMetadata[] | undefined>(
    undefined
  );

  useEffect(() => {
    callApiFull(ListLibraryWorks, true).then((result) => {
      reloadIfOldClient(result);
      setWorks(result.data);
    });
  }, []);

  return (
    <Container maxWidth="xxl" sx={{ paddingTop: 3 }}>
      <ContentBox isSmall={false}>
        <>
          <div className="contentText">Welcome to the library</div>
          <div
            className="contentTextLight"
            style={{ fontSize: FontSizes.SECONDARY }}>
            Select a work from the list below, or click <ExternalReaderButton />{" "}
            to read custom content in the reader.
          </div>
          <WorksList works={works} />
        </>
      </ContentBox>
    </Container>
  );
}
