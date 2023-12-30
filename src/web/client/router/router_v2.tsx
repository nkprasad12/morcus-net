import { PropsWithChildren, useEffect } from "react";
import * as React from "react";
import { createContext } from "react";

export interface RouteInfoV2 {
  path: string;
  params?: Record<string, string>;
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
      params: hasParams ? query : undefined,
      hash:
        rawHash.length === 0
          ? undefined
          : decodeURIComponent(rawHash.substring(1)),
    };
  }

  /** Transforms this route information back into a URL. */
  export function toLink(info: RouteInfoV2): string {
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

function pushRouteInfo(info: RouteInfoV2): void {
  const oldLink = RouteInfoV2.toLink(RouteInfoV2.extract());
  const newLink = RouteInfoV2.toLink(info);
  if (oldLink !== newLink) {
    window.history.pushState({}, "", newLink);
  }
}

function onRouteUpdate(
  action: React.SetStateAction<RouteInfoV2>,
  setRouteState: React.Dispatch<React.SetStateAction<RouteInfoV2>>
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
export interface Navigator {
  to: React.Dispatch<React.SetStateAction<RouteInfoV2>>;
  toPath: (newPath: string) => void;
}

export function getNavigator(
  navigateTo: React.Dispatch<React.SetStateAction<RouteInfoV2>>
): Navigator {
  return {
    to: navigateTo,
    toPath: (path: string) => navigateTo({ path }),
  };
}

type RouteAndSetter = {
  route: RouteInfoV2;
  navigateTo: React.Dispatch<React.SetStateAction<RouteInfoV2>>;
};
export const RouteContextV2 = createContext<RouteAndSetter>({
  route: { path: "" },
  navigateTo: () => {},
});

export namespace RouterV2 {
  interface RootProps {
    /**
     * The initial route value.
     *
     * If empty, it will compute this from the browser URL. This
     * should generally only be set for unit tests.
     */
    initial?: RouteInfoV2;
  }

  /** Parent component to use at the application root. */
  export function Root(props: PropsWithChildren<RootProps>) {
    const [route, setRoute] = React.useState(
      props.initial || RouteInfoV2.extract()
    );

    const navigateTo = React.useCallback(
      (action: React.SetStateAction<RouteInfoV2>) =>
        onRouteUpdate(action, setRoute),
      [setRoute]
    );

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

  interface TestRootProps extends RootProps {
    updateListener?: (route: RouteInfoV2) => any;
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

  /** Hook to use in components that need routing. */
  export function useRouter(): { route: RouteInfoV2; nav: Navigator } {
    const { route, navigateTo } = React.useContext(RouteContextV2);
    const nav = React.useMemo(() => getNavigator(navigateTo), [navigateTo]);
    return { route, nav };
  }
}
