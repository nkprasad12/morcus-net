import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { Container, SpanLink } from "@/web/client/components/generic/basics";
import { SearchBoxNoAutocomplete } from "@/web/client/components/generic/search";
import { SingleItemStore } from "@/web/client/offline/single_item_store";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import {
  Router,
  type NavHelper,
  type RouteInfo,
} from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { useCallback, useState } from "react";

const SEARCH_PLACEHOLDER = "filter by name or author";

const WORK_STYLE: React.CSSProperties = {
  display: "block",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function onWorkSelected(
  work: LibraryWorkMetadata,
  nav: NavHelper<RouteInfo>,
  aux?: boolean
) {
  const params = { author: work.urlAuthor, name: work.urlName };
  const path = ClientPaths.WORK_BY_NAME.toUrlPath(params);
  if (path === null) {
    return;
  }
  const saved = LibrarySavedSpot.get(work.id);
  if (aux) {
    nav.inNewTab({ path, params: { id: saved } });
  } else {
    nav.to({ path, params: { id: saved } });
  }
}

type WorkListState = "Loading" | "Error" | LibraryWorkMetadata[];
function WorksList(props: { works: WorkListState }) {
  const { nav } = Router.useRouter();
  const [filter, setFilter] = useState<string>("");

  if (props.works === "Loading") {
    return <span className="text sm">Loading titles ...</span>;
  }
  if (props.works === "Error") {
    return (
      <span className="text sm">
        Error loading titles. Check your internet and if the problem persists,
        contact Morcus.
      </span>
    );
  }

  function shouldShowWork(work: LibraryWorkMetadata): boolean {
    const query = filter.toLowerCase().trim();
    return (
      !work.isTranslation &&
      (work.id === query ||
        work.author.toLowerCase().includes(query) ||
        work.name.toLowerCase().includes(query))
    );
  }

  const filteredWorks = props.works.filter(shouldShowWork);

  return (
    <div style={{ maxWidth: "400px", margin: "auto" }}>
      <SearchBoxNoAutocomplete
        onInput={setFilter}
        placeholderText={SEARCH_PLACEHOLDER}
        // Left and right are not equal to account for the border.
        style={{ padding: "8px 12px 4px 8px" }}
        ariaLabel={SEARCH_PLACEHOLDER}
        onRawEnter={() =>
          filteredWorks.length === 1 && onWorkSelected(filteredWorks[0], nav)
        }
        autoFocused
      />
      {filteredWorks.map((work) => (
        <div key={work.id}>
          <SpanLink
            id={work.id}
            className="latWork"
            onClick={() => onWorkSelected(work, nav)}
            onAuxClick={() => onWorkSelected(work, nav, true)}>
            <span style={WORK_STYLE}>{work.name}</span>
            <span className="text sm light" style={WORK_STYLE}>
              {work.author}
            </span>
            {work.translationId && (
              <span className="text xs light smallChip shChip">
                Has Translation
              </span>
            )}
            {work.attribution === "hypotactic" && (
              <span className="text xs light smallChip numChip">
                Macronized
              </span>
            )}
          </SpanLink>
        </div>
      ))}
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
    <Container
      maxWidth="md"
      style={{ paddingTop: "12px", paddingBottom: "12px" }}
      className="text md library">
      <div>
        Welcome to the library. Select an existing work from the list below, or{" "}
        <ExternalReaderLink />.
      </div>
      <WorksList works={works} />
    </Container>
  );
}
