import { PropsWithChildren, useEffect } from "react";
import * as React from "react";
import { createContext } from "react";

export interface RouteInfo {
  path: string;
  params?: Record<string, string | undefined>;
  hash?: string;
  replace?: boolean;
}

type ToLinkFunction<T> = (t: T, full?: boolean) => string;

export namespace RouteInfo {
  /** Extracts route information from the Browser URL. */
  export function extract(): RouteInfo {
    const path = window.location.pathname;
    const params: Record<string, string> = {};
    const urlSearchParams = new URLSearchParams(window.location.search);
    for (const [key, value] of urlSearchParams) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    const rawHash = window.location.hash;
    return {
      path,
      params,
      hash:
        rawHash.length === 0
          ? undefined
          : decodeURIComponent(rawHash.substring(1)),
    };
  }

  /** Transforms this route information back into a URL. */
  export function toLink(info: RouteInfo, full?: boolean): string {
    let result = info.path;
    const query = info.params || {};
    const queryKeys = Object.keys(query);
    if (queryKeys.length > 0) {
      result += "?";
      result += queryKeys
        .map((key) => [key, query[key]])
        .filter((x): x is [string, string] => x[1] !== undefined)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join("&");
    }
    if (info.hash !== undefined) {
      result += `#${encodeURIComponent(info.hash)}`;
    }
    return `${full ? window.location.origin : ""}${result}`;
  }
}

function pushRouteInfo(info: RouteInfo): void {
  const oldLink = RouteInfo.toLink(RouteInfo.extract());
  const newLink = RouteInfo.toLink(info);
  if (oldLink !== newLink) {
    const action: keyof typeof window.history = info.replace
      ? "replaceState"
      : "pushState";
    window.history[action]({}, "", newLink);
  }
}

function onRouteUpdate(
  action: React.SetStateAction<RouteInfo>,
  setRouteState: React.Dispatch<React.SetStateAction<RouteInfo>>
): void {
  // A little hacky, bit consume the `replace` in `pushRouteInfo`
  // and delete it when we save the state.
  if (typeof action === "function") {
    setRouteState((prev) => {
      const next = action(prev);
      pushRouteInfo(next);
      delete next.replace;
      return next;
    });
  } else {
    pushRouteInfo(action);
    delete action.replace;
    setRouteState(action);
  }
}

export interface NavHelper<T> {
  to: React.Dispatch<React.SetStateAction<T>>;
  toPath: (newPath: string) => void;
  toLink: ToLinkFunction<T>;
  inNewTab: (t: T) => void;
}

function getNavigator(
  navigateTo: React.Dispatch<React.SetStateAction<RouteInfo>>
): NavHelper<RouteInfo> {
  return {
    to: navigateTo,
    toPath: (path: string) => navigateTo({ path, params: {} }),
    toLink: RouteInfo.toLink,
    inNewTab: (t) => window.open(RouteInfo.toLink(t)),
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
    toLink: (t) => nav.toLink(toRoute(t)),
    inNewTab: (t) => nav.inNewTab(toRoute(t)),
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
      []
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
    updateListener?: (route: RouteInfo) => unknown;
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
