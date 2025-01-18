import type { ProcessedWork2 } from "@/common/library/library_types";
import { LARGE_VIEW_MAIN_COLUMN_ID } from "@/web/client/pages/library/base_reader";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import type { NavHelper, RouteInfo } from "@/web/client/router/router_v2";

export interface WorkPage {
  id: string[];
}

export interface NavTreeNode {
  id: string[];
  children: NavTreeNode[];
}

export interface PaginatedWork extends ProcessedWork2 {
  pages: WorkPage[];
  navTree: NavTreeNode;
}

export function navigateToSection(
  sectionId: string,
  nav: NavHelper<RouteInfo>,
  work: PaginatedWork,
  line?: string
) {
  nav.to((old) => ({
    path: old.path,
    params: {
      id: sectionId,
      ...(line === undefined ? {} : { l: line }),
    },
  }));
  const twoColumnMain = document.getElementById(LARGE_VIEW_MAIN_COLUMN_ID);
  const isOneColumn = twoColumnMain === null;
  const container = isOneColumn ? window : twoColumnMain;
  container?.scrollTo({ top: isOneColumn ? 64 : 0, behavior: "instant" });
  const id = [work.info.title, work.info.author].join("@");
  LibrarySavedSpot.set(id, sectionId);
}
