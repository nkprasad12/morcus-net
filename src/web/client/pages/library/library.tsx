import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { Container, SpanLink } from "@/web/client/components/generic/basics";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import {
  Router,
  type NavHelper,
  type RouteInfo,
} from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { useState } from "react";

function onWorkSelected(work: LibraryWorkMetadata, nav: NavHelper<RouteInfo>) {
  const params = { author: work.urlAuthor, name: work.urlName };
  const path = ClientPaths.WORK_BY_NAME.toUrlPath(params);
  if (path !== null) {
    const id = [work.name, work.author].join("@");
    const page = LibrarySavedSpot.get(id) || 1;
    nav.to({ path, params: { pg: `${page}` } });
  }
}

type WorkListState = "Loading" | "Error" | LibraryWorkMetadata[];
function WorksList(props: { works: WorkListState }) {
  const { nav } = Router.useRouter();

  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column" }}>
      {props.works === "Loading" ? (
        <span className="text sm">Loading titles ...</span>
      ) : props.works === "Error" ? (
        <span className="text sm">
          Error loading titles. Check your internet and if the problem persists,
          contact Morcus.
        </span>
      ) : (
        props.works.map((work) => (
          <div key={work.id}>
            <SpanLink
              id={work.id}
              className="latWork"
              onClick={() => onWorkSelected(work, nav)}>
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
  const [works, setWorks] = useState<WorkListState>("Loading");

  useApiCall(ListLibraryWorks, true, {
    reloadOldClient: true,
    onResult: setWorks,
    onLoading: () => setWorks("Loading"),
    onError: () => setWorks("Error"),
  });

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
