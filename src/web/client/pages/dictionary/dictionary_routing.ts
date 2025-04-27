import {
  DictInfo,
  isDictLang,
  type DictLang,
} from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { RouteInfo, Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";
const DICTS_KEY = "in";
const LANG_KEY = "lang";

const INFLECTED_SEARCH_COMPATIBILITY_ENABLED = "1";
const ID_SEARCH_ENABLED = "2";

export interface DictRoute {
  /** The base path. */
  path: string;
  /** The search query. */
  query?: string;
  /** The browser hash. */
  hash?: string;
  /** Whether inflected search features are enabled. */
  inflectedSearch?: boolean;
  /** Whether the search query is by id. */
  idSearch?: boolean;
  /**
   * Which dictionaries to search in.
   * If left undefined, all dictionaries will be searched.
   */
  dicts?: DictInfo[] | DictInfo;
  /** Which source languages to filter on. */
  lang?: DictLang;
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
  // Ensure that the parse side supports both "-" and "," as separators.
  // In the future, we will use "-" as the separator to avoid ugly URLs,
  // but we need to support "," for backwards compatibility of old clients.
  const splitter = param.includes("-") ? "-" : ",";
  const keys = param.split(splitter).map((part) => part.replace("n", "&"));
  const dicts = LatinDict.AVAILABLE.filter((dict) => keys.includes(dict.key));
  return dicts.length === 1 ? dicts[0] : dicts;
}

function toRoute(info: DictRoute): RouteInfo {
  if (info.idSearch) {
    return { path: info.path };
  }
  const params: Record<string, string | undefined> = {};
  const optionMode =
    info.inflectedSearch === true
      ? INFLECTED_SEARCH_COMPATIBILITY_ENABLED
      : undefined;
  params[QUERY_KEY] = info.query;
  params[DICTS_KEY] = dictsToParam(info.dicts);
  params[LANG_KEY] = info.lang;
  params[OPTIONS_KEY] = optionMode;
  return { path: info.path, params, hash: info.hash };
}

function fromRoute(info: RouteInfo): DictRoute {
  const idParams = ClientPaths.DICT_BY_ID.parseParams(info.path);
  if (idParams !== null) {
    return {
      path: info.path,
      query: idParams.id,
      idSearch: true,
      hash: info.hash,
    };
  }
  const params = info.params || {};
  const option = params[OPTIONS_KEY];
  const rawLang = params[LANG_KEY];
  return {
    path: info.path,
    query: params[QUERY_KEY],
    inflectedSearch: option === INFLECTED_SEARCH_COMPATIBILITY_ENABLED,
    idSearch: option === ID_SEARCH_ENABLED,
    dicts: dictsFromParam(params[DICTS_KEY]),
    lang: rawLang !== undefined && isDictLang(rawLang) ? rawLang : undefined,
    hash: info.hash,
  };
}

export const useDictRouter = () =>
  Router.useConvertedRouter(fromRoute, toRoute);
