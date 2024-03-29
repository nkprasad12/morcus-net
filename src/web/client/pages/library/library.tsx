import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { Container, SpanLink } from "@/web/client/components/generic/basics";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import { Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { useState, useEffect } from "react";

function WorksList(props: { works: undefined | LibraryWorkMetadata[] }) {
  const { nav } = Router.useRouter();

  function onWorkSelected(work: LibraryWorkMetadata) {
    const params = { author: work.urlAuthor, name: work.urlName };
    const path = ClientPaths.WORK_BY_NAME.toUrlPath(params);
    if (path !== null) {
      const id = [work.name, work.author].join("@");
      const page = LibrarySavedSpot.get(id) || 1;
      nav.to({ path, params: { pg: `${page}` } });
    }
  }

  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column" }}>
      {props.works === undefined ? (
        <span>Loading titles ...</span>
      ) : (
        props.works.map((work) => (
          <div key={work.id}>
            <SpanLink
              id={work.id}
              className="latWork"
              onClick={() => onWorkSelected(work)}>
              <span>{work.name}</span>{" "}
              <span className="text md light">{work.author}</span>
            </SpanLink>
          </div>
        ))
      )}
    </div>
  );
}

function ExternalReaderLink() {
  const { nav } = Router.useRouter();

  return (
    <SpanLink
      className="jsLink"
      onClick={() => nav.toPath(ClientPaths.EXTERNAL_CONTENT_READER.path)}
      id="externalReaderLink">
      {"input your own text"}
    </SpanLink>
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
    <Container maxWidth="xxl" style={{ paddingTop: "24px" }}>
      <ContentBox isSmall={false}>
        <>
          <div className="text md">Welcome to the library</div>
          <div className="text md light">
            Select a work from the list below, or <ExternalReaderLink />.
          </div>
          <WorksList works={works} />
        </>
      </ContentBox>
    </Container>
  );
}
