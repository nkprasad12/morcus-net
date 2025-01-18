import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { Container, SpanLink } from "@/web/client/components/generic/basics";
import { SingleItemStore } from "@/web/client/offline/single_item_store";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import {
  Router,
  type NavHelper,
  type RouteInfo,
} from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { useCallback, useState } from "react";

function onWorkSelected(work: LibraryWorkMetadata, nav: NavHelper<RouteInfo>) {
  const params = { author: work.urlAuthor, name: work.urlName };
  const path = ClientPaths.WORK_BY_NAME.toUrlPath(params);
  if (path !== null) {
    const id = [work.name, work.author].join("@");
    const saved = LibrarySavedSpot.get(id);
    const useSectionId = typeof saved === "string";
    const pg = useSectionId ? undefined : `${saved ?? 1}`;
    const sectionId = useSectionId ? saved : undefined;
    nav.to({ path, params: { pg, id: sectionId } });
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
              <span style={{ whiteSpace: "nowrap" }}>{work.name}</span>{" "}
              <span className="text md light" style={{ whiteSpace: "nowrap" }}>
                {work.author}
              </span>
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
      className="dLink"
      onClick={() => nav.toPath(ClientPaths.EXTERNAL_CONTENT_READER.path)}
      id="externalReaderLink">
      {"input your own text"}
    </SpanLink>
  );
}

export function Library() {
  const [works, setWorks] = useState<WorkListState>("Loading");

  const onResult = useCallback((results: LibraryWorkMetadata[]) => {
    setWorks(results);
    // This is used for offline mode on a best-effort basis. We don't
    // mind doing it every time since the data is only a
    SingleItemStore.forKey(ListLibraryWorks.path).set(results);
  }, []);

  useApiCall(ListLibraryWorks, true, {
    reloadOldClient: true,
    onResult,
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
