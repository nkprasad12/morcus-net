import { PropsWithChildren, useEffect } from "react";
import * as React from "react";
import { createContext } from "react";

export interface RouteInfo {
  path: string;
  params?: Record<string, string>;
  hash?: string;
}

export namespace RouteInfo {
  /** Extracts route information from the Browser URL. */
  export function extract(): RouteInfo {
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
      params: hasParams ? query : undefined,
      hash:
        rawHash.length === 0
          ? undefined
          : decodeURIComponent(rawHash.substring(1)),
    };
  }

  /** Transforms this route information back into a URL. */
  export function toLink(info: RouteInfo): string {
    let result = info.path;
    const query = info.params || {};
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

function pushRouteInfo(info: RouteInfo): void {
  const oldLink = RouteInfo.toLink(RouteInfo.extract());
  const newLink = RouteInfo.toLink(info);
  if (oldLink !== newLink) {
    window.history.pushState({}, "", newLink);
  }
}

function onRouteUpdate(
  action: React.SetStateAction<RouteInfo>,
  setRouteState: React.Dispatch<React.SetStateAction<RouteInfo>>
): void {
  if (typeof action === "function") {
    setRouteState((prev) => {
      const next = action(prev);
      pushRouteInfo(next);
      return next;
    });
  } else {
    pushRouteInfo(action);
    setRouteState(action);
  }
}

export interface NavHelper<T> {
  to: React.Dispatch<React.SetStateAction<T>>;
  toPath: (newPath: string) => void;
}

function getNavigator(
  navigateTo: React.Dispatch<React.SetStateAction<RouteInfo>>
): NavHelper<RouteInfo> {
  return {
    to: navigateTo,
    toPath: (path: string) => navigateTo({ path }),
  };
}

function convertNavigator<T extends object | boolean | number>(
  fromRoute: (route: RouteInfo) => T,
  toRoute: (t: T) => RouteInfo,
  nav: NavHelper<RouteInfo>
): NavHelper<T> {
  return {
    to: (value) => {
      if (typeof value === "function") {
        nav.to((prev) => toRoute(value(fromRoute(prev))));
      } else {
        nav.to(toRoute(value));
      }
    },
    toPath: nav.toPath,
  };
}

type RouteAndSetter = {
  route: RouteInfo;
  navigateTo: React.Dispatch<React.SetStateAction<RouteInfo>>;
};
export const RouteContext = createContext<RouteAndSetter>({
  route: { path: "" },
  navigateTo: () => {},
});

export namespace Router {
  interface RootProps {
    /**
     * The initial route value.
     *
     * If empty, it will compute this from the browser URL. This
     * should generally only be set for unit tests.
     */
    initial?: RouteInfo;
  }

  /** Parent component to use at the application root. */
  export function Root(props: PropsWithChildren<RootProps>) {
    const [route, setRoute] = React.useState(
      props.initial || RouteInfo.extract()
    );

    const navigateTo = React.useCallback(
      (action: React.SetStateAction<RouteInfo>) =>
        onRouteUpdate(action, setRoute),
      [setRoute]
    );

    useEffect(() => {
      const popstateListener = () => {
        setRoute(RouteInfo.extract());
      };
      window.addEventListener("popstate", popstateListener);
      return () => window.removeEventListener("popstate", popstateListener);
    }, []);

    return (
      <RouteContext.Provider value={{ route, navigateTo }}>
        {props.children}
      </RouteContext.Provider>
    );
  }

  interface TestRootProps extends RootProps {
    updateListener?: (route: RouteInfo) => any;
  }

  function TestRootHelper(props: TestRootProps) {
    const { initial, updateListener } = props;
    const { route } = useRouter();
    useEffect(() => {
      if (updateListener !== undefined && route !== initial) {
        updateListener(route);
      }
    }, [route, updateListener, initial]);

    return null;
  }

  /** Parent component to use at the application root for tests. */
  export function TestRoot(props: PropsWithChildren<TestRootProps>) {
    return (
      <Root initial={props.initial}>
        {props.children}
        <TestRootHelper {...props} />
      </Root>
    );
  }

  interface RouterType<T> {
    route: T;
    nav: NavHelper<T>;
  }

  /** Hook to use in components that need routing. */
  export function useRouter(): RouterType<RouteInfo> {
    const { route, navigateTo } = React.useContext(RouteContext);
    const nav = React.useMemo(() => getNavigator(navigateTo), [navigateTo]);
    return { route, nav };
  }

  export function useConvertedRouter<T extends object | boolean | number>(
    fromRoute: (route: RouteInfo) => T,
    toRoute: (t: T) => RouteInfo
  ): RouterType<T> {
    const { route, nav } = useRouter();
    const convertedNav = React.useMemo(
      () => convertNavigator(fromRoute, toRoute, nav),
      [fromRoute, toRoute, nav]
    );
    return { route: fromRoute(route), nav: convertedNav };
  }
}
