import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { FontSizes } from "@/web/client/styles";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import Container from "@mui/material/Container";
import { useState, useEffect } from "react";

function WorksList(props: { works: undefined | LibraryWorkMetadata[] }) {
  const { nav } = Router.useRouter();

  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column" }}>
      {props.works === undefined ? (
        <span>Loading titles ...</span>
      ) : (
        props.works.map((work) => (
          <div key={work.id}>
            <span
              className="latWork"
              onClick={() => {
                const params = { workId: work.id };
                const path = ClientPaths.WORK_PAGE.toUrlPath(params);
                if (path !== null) {
                  nav.toPath(path);
                }
              }}
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
  const { nav } = Router.useRouter();

  return (
    <span
      className="jsLink"
      onClick={() => nav.toPath(ClientPaths.EXTERNAL_CONTENT_READER.path)}>
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
