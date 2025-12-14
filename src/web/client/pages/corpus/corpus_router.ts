import type { PageData } from "@/common/library/corpus/corpus_common";
import { safeParseInt } from "@/common/misc_utils";
import {
  Router,
  type NavHelper,
  type RouteInfo,
} from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";

interface CorpusUrlData {
  query: string;
  currentPage?: string;
  lastPage?: string;
  nextPage?: string;
  pageSize: number;
  contextLen: number;
  strictMode?: boolean;
}

const UNDEF_PAGE = "";
const NULL_PAGE = "null";
const PAGE_JOINER = "-";

const fromRoute = (route: RouteInfo): CorpusUrlData => ({
  query: route.params?.q?.trim() ?? "",
  currentPage: route.params?.cp,
  lastPage: route.params?.lp,
  nextPage: route.params?.np,
  pageSize: safeParseInt(route.params?.ps) ?? 50,
  contextLen: safeParseInt(route.params?.cl) ?? 20,
  strictMode: route.params?.sm === "1",
});

export const parsePageData = (
  pageDataStr?: string
): PageData | null | undefined => {
  if (pageDataStr === undefined || pageDataStr === UNDEF_PAGE) {
    return undefined;
  }
  if (pageDataStr === NULL_PAGE) {
    return null;
  }
  const parts = pageDataStr.split(PAGE_JOINER);
  if (parts.length !== 3) {
    return undefined;
  }
  const resultId = safeParseInt(parts[0]);
  const resultIndex = safeParseInt(parts[1]);
  const candidateIndex = safeParseInt(parts[2]);
  if (
    resultId === undefined ||
    resultIndex === undefined ||
    candidateIndex === undefined
  ) {
    return undefined;
  }
  return {
    resultId,
    resultIndex,
    candidateIndex,
  };
};

export const serializePageData = (
  pageData: PageData | null | undefined
): string => {
  if (pageData === undefined) {
    return UNDEF_PAGE;
  }
  if (pageData === null) {
    return NULL_PAGE;
  }
  const parts = [
    pageData.resultId,
    pageData.resultIndex,
    pageData.candidateIndex,
  ];
  return parts.join(PAGE_JOINER);
};

const toRoute = (info: CorpusUrlData): RouteInfo => ({
  path: ClientPaths.CORPUS_QUERY_PATH.path,
  params: {
    q: info.query,
    cp: info.currentPage,
    lp: info.lastPage,
    np: info.nextPage,
    ps: info.pageSize.toString(),
    cl: info.contextLen.toString(),
    sm: info.strictMode ? "1" : "0",
  },
});

export const useCorpusRouter = () =>
  Router.useConvertedRouter(fromRoute, toRoute);

export function setNewQuery(nav: NavHelper<CorpusUrlData>, query: string) {
  nav.to((old) => ({
    pageSize: old.pageSize,
    contextLen: old.contextLen,
    query,
  }));
}
