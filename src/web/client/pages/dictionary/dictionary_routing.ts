import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { PagePath } from "@/web/client/router/paths";
import { RouteInfo, Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";
const DICTS_KEY = "in";

const EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED = "1";
const ID_SEARCH_ENABLED = "2";

export interface DictRoute {
  /** The base path. */
  path: string;
  /** The search query. */
  query?: string;
  /** The browser hash. */
  hash?: string;
  /** Whether experimental search features are enabled. */
  experimentalSearch?: boolean;
  /** Whether the search query is by id. */
  idSearch?: boolean;
  /**
   * Which dictionaries to search in.
   * If left undefined, all dictionaries will be searched.
   */
  dicts?: DictInfo[] | DictInfo;
}

function dictsToParam(rawDicts?: DictInfo[] | DictInfo): string | undefined {
  if (rawDicts === undefined) {
    return undefined;
  }
  const dicts = Array.isArray(rawDicts) ? rawDicts : [rawDicts];
  return dicts.map((d) => d.key.replace("&", "n")).join(",");
}

function dictsFromParam(param?: string): DictInfo[] | DictInfo | undefined {
  if (param === undefined) {
    return undefined;
  }
  const keys = param.split(",").map((part) => part.replace("n", "&"));
  const dicts = LatinDict.AVAILABLE.filter((dict) => keys.includes(dict.key));
  return dicts.length === 1 ? dicts[0] : dicts;
}

function toRoute(info: DictRoute): RouteInfo {
  const params: Record<string, string | undefined> = {};
  const optionMode =
    info.experimentalSearch === true
      ? EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED
      : info.idSearch === true
      ? ID_SEARCH_ENABLED
      : undefined;
  params[QUERY_KEY] = info.query;
  params[DICTS_KEY] = dictsToParam(info.dicts);
  params[OPTIONS_KEY] = optionMode;
  return { path: info.path, params, hash: info.hash };
}

function fromRoute(info: RouteInfo): DictRoute {
  const idParams = PagePath.parseParams(ClientPaths.DICT_BY_ID, info.path);
  if (idParams !== null) {
    return {
      path: info.path,
      query: idParams.id,
      idSearch: true,
    };
  }
  const params = info.params || {};
  const option = params[OPTIONS_KEY];
  return {
    path: info.path,
    query: params[QUERY_KEY],
    experimentalSearch: option === EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED,
    idSearch: option === ID_SEARCH_ENABLED,
    dicts: dictsFromParam(params[DICTS_KEY]),
    hash: info.hash,
  };
}

export const useDictRouter = () =>
  Router.useConvertedRouter(fromRoute, toRoute);
