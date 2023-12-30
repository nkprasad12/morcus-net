import { RouteInfoV2 } from "@/web/client/router/router_v2";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";

const EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED = "1";
const ID_SEARCH_ENABLED = "2";

export interface RouteInfo {
  path: string;
  query?: string;
  experimentalSearch?: boolean;
  hash?: string;
  internalSource?: boolean;
  idSearch?: boolean;
}

export namespace RouteInfo {
  export function toV2(info: RouteInfo): RouteInfoV2 {
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
      result.query = {};
    }
    if (optionMode !== undefined) {
      result.query![OPTIONS_KEY] = optionMode;
    }
    if (query !== undefined) {
      result.query![QUERY_KEY] = query;
    }
    return result;
  }

  export function fromV2(info: RouteInfoV2): RouteInfo {
    const result: RouteInfo = {
      path: info.path,
      hash: info.hash,
    };
    if (info.query !== undefined) {
      const option = info.query[OPTIONS_KEY];
      result.experimentalSearch =
        option === EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED;
      result.idSearch = option === ID_SEARCH_ENABLED;
      result.query = info.query[QUERY_KEY];
    }
    return result;
  }
}
