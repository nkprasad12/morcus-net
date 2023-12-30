/**
 * @jest-environment jsdom
 */

import { RouteInfoV2, RouterV2 } from "@/web/client/router/router_v2";
import { act, screen, render } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useEffect } from "react";

function TestApp(props: {
  navSpy: (info: RouteInfoV2) => any;
  target?: RouteInfoV2;
}) {
  const { route, nav } = RouterV2.useRouter();
  const { navSpy } = props;

  useEffect(() => {
    navSpy(route);
  }, [route, navSpy]);

  return <span onClick={() => nav.to(props.target || route)}>Button</span>;
}

describe("RouteInfoV2", () => {
  test("toLink handles bare path", () => {
    const url = RouteInfoV2.toLink({ path: "/foo" });
    expect(url).toBe("/foo");
  });

  test("toLink handles bare path with hash", () => {
    const url = RouteInfoV2.toLink({ path: "/foo", hash: "hash" });
    expect(url).toBe("/foo#hash");
  });

  test("toLink handles path with single query", () => {
    const url = RouteInfoV2.toLink({ path: "/foo", params: { bar: "baz" } });
    expect(url).toBe("/foo?bar=baz");
  });

  test("toLink handles path with multiple queries", () => {
    const url = RouteInfoV2.toLink({
      path: "/foo",
      params: { bar: "baz", Gallia: "omnis" },
    });
    expect(url).toBe("/foo?bar=baz&Gallia=omnis");
  });

  test("toLink handles path with query and hash", () => {
    const url = RouteInfoV2.toLink({
      path: "/foo",
      params: { bar: "baz", Gallia: "omnis" },
      hash: "hash",
    });
    expect(url).toBe("/foo?bar=baz&Gallia=omnis#hash");
  });
});

describe("RouterV2", () => {
  test("Router handles window popstate updates", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    history.pushState("", "", "www.foo.net/api?q=query#hash");

    const navSpy = jest.fn();
    render(
      <RouterV2.Root>
        <TestApp navSpy={navSpy} />
      </RouterV2.Root>
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
    const target: RouteInfoV2 = { path: "/newPath", params: { hi: "hello" } };
    const navSpy = jest.fn();

    render(
      <RouterV2.Root>
        <TestApp navSpy={navSpy} target={target} />
      </RouterV2.Root>
    );
    navSpy.mockClear();
    pushState.mockClear();

    await user.click(screen.getByText("Button"));

    expect(navSpy).toHaveBeenCalledTimes(1);
    const info = navSpy.mock.lastCall![0];
    expect(info.path.endsWith("/newPath")).toBe(true);
    expect(info.hash).toBe(undefined);
    expect(info.params).toStrictEqual({ hi: "hello" });
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.lastCall![2]).toBe("/newPath?hi=hello");
  });
});
