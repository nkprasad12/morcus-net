import { safeParseInt } from "@/common/misc_utils";
import { Router, type RouteInfo } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";

interface CorpusUrlData {
  query: string;
  startIdx: number;
  pageSize: number;
  contextLen: number;
}

const fromRoute = (route: RouteInfo): CorpusUrlData => ({
  query: route.params?.q?.trim() ?? "",
  startIdx: safeParseInt(route.params?.n) ?? 0,
  pageSize: safeParseInt(route.params?.ps) ?? 25,
  contextLen: safeParseInt(route.params?.cl) ?? 20,
});

const toRoute = (info: CorpusUrlData): RouteInfo => ({
  path: ClientPaths.CORPUS_QUERY_PATH.path,
  params: {
    q: info.query,
    n: info.startIdx.toString(),
    ps: info.pageSize.toString(),
    cl: info.contextLen.toString(),
  },
});

export const useCorpusRouter = () =>
  Router.useConvertedRouter(fromRoute, toRoute);
