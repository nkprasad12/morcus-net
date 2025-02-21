import type { ProcessedWork2 } from "@/common/library/library_types";
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
  LibrarySavedSpot.set(work.info.workId, sectionId);
}
