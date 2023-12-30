import { RouteInfoV2 } from "@/web/client/router/router_v2";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";

const EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED = "1";
const ID_SEARCH_ENABLED = "2";

export interface RouteInfo {
  path: string;
  query?: string;
  hash?: string;
  experimentalSearch?: boolean;
  idSearch?: boolean;
}

export namespace RouteInfo {
  export function fromV2(info: RouteInfoV2): RouteInfo {
    const result: RouteInfo = {
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
}
