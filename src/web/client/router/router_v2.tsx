import { PropsWithChildren, useEffect } from "react";
import * as React from "react";
import { createContext } from "react";

export interface RouteInfoV2 {
  path: string;
  query?: Record<string, string>;
  hash?: string;
}

export namespace RouteInfoV2 {
  /** Extracts route information from the Browser URL. */
  export function extract(): RouteInfoV2 {
    const path = window.location.pathname;
    const query: Record<string, string> = {};
    const urlSearchParams = new URLSearchParams(window.location.search);
    let hasParams = false;
    for (const [key, value] of urlSearchParams) {
      hasParams = true;
      query[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    const rawHash = window.location.hash;
    return {
      path,
      query: hasParams ? query : undefined,
      hash:
        rawHash.length === 0
          ? undefined
          : decodeURIComponent(rawHash.substring(1)),
    };
  }

  /** Transforms this route information back into a URL. */
  export function toLink(info: RouteInfoV2): string {
    let result = info.path;
    const query = info.query || {};
    const queryKeys = Object.keys(query);
    if (queryKeys.length > 0) {
      result += "?";
      result += queryKeys
        .map(
          (key) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`
        )
        .join("&");
    }
    if (info.hash !== undefined) {
      result += `#${encodeURIComponent(info.hash)}`;
    }
    return result;
  }
}

function pushRouteInfo(info: RouteInfoV2): void {
  window.history.pushState({}, "", RouteInfoV2.toLink(info));
}

export interface Navigator {
  to: (newRoute: RouteInfoV2) => void;
}

export function getNavigator(
  navigateTo: (info: RouteInfoV2) => any
): Navigator {
  return {
    to: navigateTo,
  };
}

type RouteAndSetter = {
  route: RouteInfoV2;
  navigateTo: (info: RouteInfoV2) => any;
};
export const RouteContextV2 = createContext<RouteAndSetter>({
  route: { path: "" },
  navigateTo: () => {},
});

export namespace RouterV2 {
  /** Parent component to use at the application root. */
  export function Root(props: PropsWithChildren<object>) {
    const [route, setRoute] = React.useState(RouteInfoV2.extract());

    const navigateTo = React.useCallback((info: RouteInfoV2) => {
      pushRouteInfo(info);
      setRoute(info);
    }, []);

    useEffect(() => {
      const popstateListener = () => {
        setRoute(RouteInfoV2.extract());
      };
      window.addEventListener("popstate", popstateListener);
      return () => window.removeEventListener("popstate", popstateListener);
    }, []);

    return (
      <RouteContextV2.Provider value={{ route, navigateTo }}>
        {props.children}
      </RouteContextV2.Provider>
    );
  }

  /** Hook to use in components that need routing. */
  export function useRouter(): [RouteInfoV2, Navigator] {
    const { route, navigateTo } = React.useContext(RouteContextV2);
    const navigator = React.useMemo(
      () => getNavigator(navigateTo),
      [navigateTo]
    );
    return [route, navigator];
  }
}
