import React, { PropsWithChildren, useEffect } from "react";
import { createContext } from "react";

const QUERY_KEY = "q";

export interface RouteInfo {
  path: string;
  query?: string;
  hash?: string;
}

function extractRouteInfo(): RouteInfo {
  const path = window.location.pathname;
  const query = new URLSearchParams(window.location.search).get(QUERY_KEY);
  const hash = window.location.hash;
  return {
    path: path,
    query: query || undefined,
    hash: hash.length === 0 ? undefined : decodeURI(hash.substring(1)),
  };
}

function pushRouteInfo(info: RouteInfo): void {
  let state = info.path;
  if (info.query !== undefined) {
    state += `?${QUERY_KEY}=${encodeURI(info.query)}`;
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

  export function query(nav: Navigation, query: string): void {
    toRouteInfo(nav, { path: nav.route.path, query: query });
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
  export interface HandlerProps {}

  export function Handler(props: PropsWithChildren<HandlerProps>) {
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
