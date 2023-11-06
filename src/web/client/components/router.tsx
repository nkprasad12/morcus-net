import React, { PropsWithChildren, useEffect } from "react";
import { createContext } from "react";

const QUERY_KEY = "q";
const OPTIONS_KEY = "o";

const EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED = "1";

export interface RouteInfo {
  path: string;
  query?: string;
  experimentalSearch?: boolean;
  hash?: string;
}

function extractRouteInfo(): RouteInfo {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  return {
    path: path,
    query: params.get(QUERY_KEY) || undefined,
    experimentalSearch:
      params.get(OPTIONS_KEY) === EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED,
    hash: hash.length === 0 ? undefined : decodeURI(hash.substring(1)),
  };
}

function pushRouteInfo(info: RouteInfo): void {
  let state = info.path;
  if (info.query !== undefined) {
    state += `?${QUERY_KEY}=${encodeURI(info.query)}`;
    if (info.experimentalSearch === true) {
      state += `&${OPTIONS_KEY}=${EXPERIMENTAL_SEARCH_COMPATIBILITY_ENABLED}`;
    }
  }
  if (info.hash !== undefined) {
    state += `#${encodeURI(info.hash)}`;
  }
  window.history.pushState({}, "", state);
}

export interface Navigation {
  route: RouteInfo;
  navigateTo: (target: RouteInfo) => any;
}

export namespace Navigation {
  export function redirect(nav: Navigation, target: string): void {
    toRouteInfo(nav, {
      path: target,
      query: nav.route.query,
      hash: nav.route.hash,
    });
  }

  export function to(nav: Navigation, target: string): void {
    toRouteInfo(nav, { path: target });
  }

  export function query(
    nav: Navigation,
    query: string,
    experimentalSearch?: boolean
  ): void {
    toRouteInfo(nav, {
      path: nav.route.path,
      query: query,
      experimentalSearch: experimentalSearch,
    });
  }

  function toRouteInfo(nav: Navigation, newInfo: RouteInfo) {
    pushRouteInfo(newInfo);
    nav.navigateTo(newInfo);
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
