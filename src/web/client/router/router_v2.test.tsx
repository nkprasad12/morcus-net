/**
 * @jest-environment jsdom
 */

import { RouteInfo, Router } from "@/web/client/router/router_v2";
import { act, screen, render } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useEffect } from "react";

function TestApp(props: {
  navSpy: (info: RouteInfo) => unknown;
  target?: RouteInfo;
}) {
  const { route, nav } = Router.useRouter();
  const { navSpy } = props;

  useEffect(() => {
    navSpy(route);
  }, [route, navSpy]);

  return <span onClick={() => nav.to(props.target || route)}>Button</span>;
}

describe("RouteInfo", () => {
  test("toLink handles bare path", () => {
    const url = RouteInfo.toLink({ path: "/foo" });
    expect(url).toBe("/foo");
  });

  test("toLink handles full path", () => {
    const url = RouteInfo.toLink({ path: "/foo" }, true);
    expect(url).toBe("http://localhost/foo");
  });

  test("toLink handles bare path with hash", () => {
    const url = RouteInfo.toLink({ path: "/foo", hash: "hash" });
    expect(url).toBe("/foo#hash");
  });

  test("toLink handles path with single query", () => {
    const url = RouteInfo.toLink({ path: "/foo", params: { bar: "baz" } });
    expect(url).toBe("/foo?bar=baz");
  });

  test("toLink handles path with multiple queries", () => {
    const url = RouteInfo.toLink({
      path: "/foo",
      params: { bar: "baz", Gallia: "omnis" },
    });
    expect(url).toBe("/foo?bar=baz&Gallia=omnis");
  });

  test("toLink handles path with query and hash", () => {
    const url = RouteInfo.toLink({
      path: "/foo",
      params: { bar: "baz", Gallia: "omnis" },
      hash: "hash",
    });
    expect(url).toBe("/foo?bar=baz&Gallia=omnis#hash");
  });
});

describe("Router", () => {
  test("Router handles window popstate updates", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    history.pushState("", "", "www.foo.net/api?q=query#hash");

    const navSpy = jest.fn();
    render(
      <Router.Root>
        <TestApp navSpy={navSpy} />
      </Router.Root>
    );

    act(() => {
      mockAddEventListener.mock.lastCall![1]();
    });

    const info = navSpy.mock.lastCall![0];
    expect(info.path.endsWith("/api")).toBe(true);
    expect(info.hash).toBe("hash");
    expect(info.params).toStrictEqual({ q: "query" });
  });

  test("Router handles navigation updates", async () => {
    const pushState = jest.fn();
    window.history.pushState = pushState;
    const target: RouteInfo = { path: "/newPath", params: { hi: "hello" } };
    const navSpy = jest.fn();

    render(
      <Router.Root>
        <TestApp navSpy={navSpy} target={target} />
      </Router.Root>
    );
    navSpy.mockClear();
    pushState.mockClear();

    await user.click(screen.getByText("Button"));

    expect(navSpy).toHaveBeenCalledTimes(1);
    const info = navSpy.mock.lastCall![0];
    expect(info.path.endsWith("/newPath")).toBe(true);
    expect(info.hash).toBe(undefined);
    expect(info.params).toStrictEqual({ hi: "hello" });
    expect(info.replace).toBeUndefined();
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.lastCall![2]).toBe("/newPath?hi=hello");
  });

  test("Router handles navigation replacements", async () => {
    const replaceState = jest.fn();
    window.history.replaceState = replaceState;
    const target: RouteInfo = {
      path: "/newPath",
      params: { hi: "hello" },
      replace: true,
    };
    const navSpy = jest.fn();

    render(
      <Router.Root>
        <TestApp navSpy={navSpy} target={target} />
      </Router.Root>
    );
    navSpy.mockClear();

    await user.click(screen.getByText("Button"));

    expect(navSpy).toHaveBeenCalledTimes(1);
    const info = navSpy.mock.lastCall![0];
    expect(info.path.endsWith("/newPath")).toBe(true);
    expect(info.hash).toBe(undefined);
    expect(info.params).toStrictEqual({ hi: "hello" });
    expect(info.replace).toBeUndefined();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.lastCall![2]).toBe("/newPath?hi=hello");
  });
});
