/**
 * @jest-environment jsdom
 */

import { act, render } from "@testing-library/react";
import { useContext, useEffect } from "react";
import {
  Navigation,
  RouteContext,
  RouteInfo,
  Router,
  linkForInfo,
} from "@/web/client/components/router";

function TestApp(props: { navSpy: (info: RouteInfo) => any }) {
  const nav = useContext(RouteContext);

  useEffect(() => {
    props.navSpy(nav.route);
  }, [nav]);

  return <></>;
}

describe("Router", () => {
  test("Handler handles window popstate updates", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    history.pushState("", "", "www.foo.net/api?q=query#hash");

    const navSpy = jest.fn();
    render(
      <Router.Handler>
        <TestApp navSpy={navSpy} />
      </Router.Handler>
    );

    act(() => {
      mockAddEventListener.mock.lastCall![1]();
    });

    const info = navSpy.mock.lastCall![0];
    expect(info.path.endsWith("/api")).toBe(true);
    expect(info.hash).toBe("hash");
    expect(info.query).toBe("query");
  });

  test("Navigation.to updates expected state", () => {
    const pushState = jest.fn();
    window.history.pushState = pushState;
    const setInfo = jest.fn();
    const initial: RouteInfo = {
      path: "origin/path1",
      query: "query1",
      hash: "hash1",
    };
    const nav: Navigation = {
      route: initial,
      navigateTo: setInfo,
    };

    Navigation.to(nav, "origin/path2");

    const newPath = { path: "origin/path2" };
    expect(setInfo).toHaveBeenCalledWith(newPath);
    expect(pushState.mock.lastCall![2]).toBe("origin/path2");
  });

  test("Navigation.redirect updates expected state", () => {
    const pushState = jest.fn();
    window.history.pushState = pushState;
    const setInfo = jest.fn();
    const initial: RouteInfo = {
      path: "origin/path1",
      query: "query1",
      hash: "hash1",
    };
    const nav: Navigation = {
      route: initial,
      navigateTo: setInfo,
    };

    Navigation.redirect(nav, "origin2/path2");

    const newPath = { path: "origin2/path2", query: "query1", hash: "hash1" };
    expect(setInfo).toHaveBeenCalledWith(newPath);
    expect(pushState.mock.lastCall![2]).toBe("origin2/path2?q=query1#hash1");
  });

  test.each([[undefined], [true], [false]])(
    "Navigation.query updates expected state with experimental %p",
    (experimentalSearch) => {
      const pushState = jest.fn();
      window.history.pushState = pushState;
      const setInfo = jest.fn();
      const initial: RouteInfo = {
        path: "origin/path1",
        query: "query1",
      };
      const nav: Navigation = {
        route: initial,
        navigateTo: setInfo,
      };

      Navigation.query(nav, "query2", { experimentalSearch });

      const newPath = {
        path: "origin/path1",
        query: "query2",
        experimentalSearch: experimentalSearch,
      };
      expect(setInfo).toHaveBeenCalledWith(newPath);
      expect(pushState.mock.lastCall![2]).toBe(
        "origin/path1?q=query2" + (experimentalSearch ? "&o=1" : "")
      );
    }
  );

  test("localOnly updates only update window state", () => {
    const pushState = jest.fn();
    window.history.pushState = pushState;
    const setInfo = jest.fn();
    const initial: RouteInfo = {
      path: "origin/path1",
      query: "query1",
    };
    const nav: Navigation = {
      route: initial,
      navigateTo: setInfo,
    };

    Navigation.query(nav, "query2", { localOnly: true });

    expect(setInfo).not.toHaveBeenCalled();
    expect(pushState.mock.lastCall![2]).toBe("origin/path1?q=query2");
  });

  test("link with id search", () => {
    const link = linkForInfo({ path: "foo", query: "bar", idSearch: true });
    expect(link).toBe("foo?q=bar&o=2");
  });
});
