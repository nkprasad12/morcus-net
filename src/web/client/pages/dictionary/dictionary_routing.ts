import { RouteInfoV2, RouterV2 } from "@/web/client/router/router_v2";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";

const EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED = "1";
const ID_SEARCH_ENABLED = "2";

export interface DictRoute {
  path: string;
  query?: string;
  hash?: string;
  experimentalSearch?: boolean;
  idSearch?: boolean;
}

function toRoute(info: DictRoute): RouteInfoV2 {
  const result: RouteInfoV2 = {
    path: info.path,
    hash: info.hash,
  };
  const optionMode =
    info.experimentalSearch === true
      ? EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED
      : info.idSearch === true
      ? ID_SEARCH_ENABLED
      : undefined;
  const query = info.query;
  if (optionMode !== undefined || query !== undefined) {
    result.params = {};
  }
  if (optionMode !== undefined) {
    result.params![OPTIONS_KEY] = optionMode;
  }
  if (query !== undefined) {
    result.params![QUERY_KEY] = query;
  }
  return result;
}

function fromRoute(info: RouteInfoV2): DictRoute {
  const result: DictRoute = {
    path: info.path,
    hash: info.hash,
  };
  if (info.params !== undefined) {
    const option = info.params[OPTIONS_KEY];
    result.experimentalSearch =
      option === EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED;
    result.idSearch = option === ID_SEARCH_ENABLED;
    result.query = info.params[QUERY_KEY];
  }
  return result;
}

export const useDictRouter = () =>
  RouterV2.useConvertedRouter(fromRoute, toRoute);
