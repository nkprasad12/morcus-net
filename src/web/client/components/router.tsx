import { PropsWithChildren, useEffect } from "react";
import * as React from "react";
import { createContext } from "react";

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

export function extractRouteInfo(): RouteInfo {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const option = params.get(OPTIONS_KEY);
  return {
    path: path,
    query: params.get(QUERY_KEY) || undefined,
    experimentalSearch: option === EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED,
    hash: hash.length === 0 ? undefined : decodeURI(hash.substring(1)),
    idSearch: option === ID_SEARCH_ENABLED,
  };
}

export function linkForInfo(info: RouteInfo): string {
  let state = info.path;
  if (info.query !== undefined) {
    state += `?${QUERY_KEY}=${encodeURI(info.query)}`;
    const optionMode =
      info.experimentalSearch === true
        ? EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED
        : info.idSearch === true
        ? ID_SEARCH_ENABLED
        : undefined;
    if (optionMode !== undefined) {
      state += `&${OPTIONS_KEY}=${optionMode}`;
    }
  }
  if (info.hash !== undefined) {
    state += `#${encodeURI(info.hash)}`;
  }
  return state;
}

function pushRouteInfo(info: RouteInfo): void {
  window.history.pushState({}, "", linkForInfo(info));
}

export interface Navigation {
  route: RouteInfo;
  navigateTo: (target: RouteInfo) => any;
}

export namespace Navigation {
  export function redirect(nav: Navigation, target: string): void {
    toRouteInfo(
      nav,
      {
        path: target,
        query: nav.route.query,
        hash: nav.route.hash,
      },
      false
    );
  }

  export function to(nav: Navigation, target: string): void {
    toRouteInfo(nav, { path: target }, false);
  }

  export function query(
    nav: Navigation,
    query: string,
    options?: {
      experimentalSearch?: boolean;
      internalSource?: boolean;
      localOnly?: boolean;
    }
  ): void {
    toRouteInfo(
      nav,
      {
        path: nav.route.path,
        query: query,
        experimentalSearch: options?.experimentalSearch,
        internalSource: options?.internalSource,
      },
      options?.localOnly === true
    );
  }

  function toRouteInfo(
    nav: Navigation,
    newInfo: RouteInfo,
    localOnly: boolean
  ) {
    pushRouteInfo(newInfo);
    if (!localOnly) {
      nav.navigateTo(newInfo);
    }
  }
}

export const RouteContext: React.Context<Navigation> = createContext({
  route: { path: "" },
  navigateTo: (_) => {},
});

export namespace Router {
  export function Handler(props: PropsWithChildren<Record<string, any>>) {
    const [route, setRoute] = React.useState<RouteInfo>(extractRouteInfo());

    useEffect(() => {
      const popstateListener = () => {
        setRoute(extractRouteInfo());
      };
      window.addEventListener("popstate", popstateListener);
      return () => {
        window.removeEventListener("popstate", popstateListener);
      };
    }, []);

    return (
      <RouteContext.Provider
        value={{
          route: route,
          navigateTo: setRoute,
        }}
      >
        {props.children}
      </RouteContext.Provider>
    );
  }
}
