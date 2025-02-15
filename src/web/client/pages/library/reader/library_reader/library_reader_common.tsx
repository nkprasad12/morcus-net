import type { ProcessedWork2 } from "@/common/library/library_types";
import { LARGE_VIEW_MAIN_COLUMN_ID } from "@/web/client/pages/library/base_reader";
import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";
import type { NavHelper, RouteInfo } from "@/web/client/router/router_v2";

export type PaginatedWork = ProcessedWork2;

export function navigateToSection(
  sectionId: string,
  nav: NavHelper<RouteInfo>,
  work: PaginatedWork,
  replace?: boolean
) {
  nav.to((old) => ({
    path: old.path,
    params: { id: sectionId },
    replace,
  }));
  const twoColumnMain = document.getElementById(LARGE_VIEW_MAIN_COLUMN_ID);
  const isOneColumn = twoColumnMain === null;
  const container = isOneColumn ? window : twoColumnMain;
  container?.scrollTo({ top: 0, behavior: "instant" });
  LibrarySavedSpot.set(work.info.workId, sectionId);
}
