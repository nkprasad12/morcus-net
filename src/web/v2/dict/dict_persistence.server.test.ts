import {
  ownSettingsHref,
  planDictPersistence,
} from "@/web/v2/dict/dict_persistence.server";

const BASE = {
  cookieHeader: undefined,
  isPartial: false,
  isScopedView: false,
  keysFromQuery: null,
  oParam: undefined,
} as const;

function cookieNames(cookies: string[]): string[] {
  return cookies.map((c) => c.split("=")[0]);
}

describe("planDictPersistence", () => {
  describe("the TODOS §8 table", () => {
    test("own form submit with save=1: writes, then 303s to the canonical URL without the marker", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo&dict=GAF&o=0&o=1&save=1",
        keysFromQuery: ["GAF"],
        oParam: true,
      });
      expect(plan.cookies).toEqual([
        expect.stringMatching(/^morcus_d=2;/),
        expect.stringMatching(/^morcus_inflected=1;/),
      ]);
      expect(plan.redirectTo).toBe("/v2/dicts?q=amo&o=1&d=2");
    });

    test("cross-site request with save=1 strips the marker without writing cookies", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo&dict=GAF&o=0&save=1",
        secFetchSite: "cross-site",
        keysFromQuery: ["GAF"],
        oParam: false,
      });
      expect(plan.cookies).toEqual([]);
      expect(plan.redirectTo).toBe("/v2/dicts?q=amo&o=0&d=2");
    });

    test("same-origin request with save=1 writes cookies normally", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo&dict=GAF&o=0&save=1",
        secFetchSite: "same-origin",
        keysFromQuery: ["GAF"],
        oParam: false,
      });
      expect(cookieNames(plan.cookies)).toEqual([
        "morcus_d",
        "morcus_inflected",
      ]);
      expect(plan.redirectTo).toBe("/v2/dicts?q=amo&o=0&d=2");
    });

    test("recipient opens a shared link: writes nothing new, renders in place", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo&dict=GAF",
        cookieHeader: "morcus_d=1",
        keysFromQuery: ["GAF"],
      });
      expect(plan.redirectTo).toBeUndefined();
      // Only the sliding refresh of the recipient's own value: never the URL's GAF.
      expect(plan.cookies).toEqual([expect.stringMatching(/^morcus_d=1;/)]);
    });

    test("recipient's own bare search afterwards: still nothing new", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo",
        cookieHeader: "morcus_d=1",
      });
      expect(plan.redirectTo).toBeUndefined();
      expect(plan.cookies).toEqual([expect.stringMatching(/^morcus_d=1;/)]);
    });
  });

  test("an ordinary No-JS search (Enter) persists nothing", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl: "/v2/dicts?q=amo&o=0&dict=GAF",
      keysFromQuery: ["GAF"],
      oParam: false,
    });
    expect(plan).toEqual({ cookies: [] });
  });

  test("save=1 with only inflection in the URL writes only inflection", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl: "/v2/dicts?o=0&save=1",
      oParam: false,
    });
    expect(cookieNames(plan.cookies)).toEqual(["morcus_inflected"]);
    expect(plan.redirectTo).toBe("/v2/dicts?o=0");
  });

  test("the redirect canonicalizes dict keys to d=<bitmask> and keeps other params", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl:
        "/v2/dicts?q=amo&dict=L%26S&dict=GRG&save=1&scale=120&embedded=0",
      keysFromQuery: ["L&S", "GRG"],
    });
    const target = new URL(plan.redirectTo!, "http://x");
    expect(target.pathname).toBe("/v2/dicts");
    expect(target.searchParams.get("d")).toBe("1t");
    expect(target.searchParams.has("dict")).toBe(false);
    expect(target.searchParams.get("q")).toBe("amo");
    expect(target.searchParams.get("scale")).toBe("120");
    expect(target.searchParams.has("save")).toBe(false);
  });

  test("partial requests never write or redirect, even with save=1", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl: "/v2/dicts?q=amo&d=2&save=1&format=partial",
      cookieHeader: "morcus_d=1",
      isPartial: true,
      keysFromQuery: ["GAF"],
    });
    expect(plan).toEqual({ cookies: [] });
  });

  test("scoped views never write or redirect, even with save=1", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl: "/v2/dicts?q=amo&dict=GAF&embedded=1&save=1",
      cookieHeader: "morcus_d=1; morcus_inflected=0",
      isScopedView: true,
      keysFromQuery: ["GAF"],
    });
    expect(plan).toEqual({ cookies: [] });
  });

  test("save=0 or other values are not a save", () => {
    const plan = planDictPersistence({
      ...BASE,
      originalUrl: "/v2/dicts?q=amo&dict=GAF&save=0",
      keysFromQuery: ["GAF"],
    });
    expect(plan).toEqual({ cookies: [] });
  });

  describe("sliding refresh", () => {
    test("re-sends both existing cookies with their own values", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo&d=an&o=1",
        cookieHeader: "morcus_d=3; morcus_inflected=0",
        keysFromQuery: ["L&S"],
        oParam: true,
      });
      expect(plan.cookies).toEqual([
        expect.stringMatching(/^morcus_d=3;.*Max-Age=31536000/),
        expect.stringMatching(/^morcus_inflected=0;.*Max-Age=31536000/),
      ]);
    });

    test("does not re-send unparseable or stale cookies", () => {
      const plan = planDictPersistence({
        ...BASE,
        originalUrl: "/v2/dicts?q=amo",
        cookieHeader:
          "morcus_dicts=L%26S; morcus_d=L%26S; morcus_inflected=maybe",
      });
      expect(plan).toEqual({ cookies: [] });
    });
  });
});

describe("ownSettingsHref", () => {
  test("drops every settings parameter and keeps the rest", () => {
    expect(
      ownSettingsHref(
        "/v2/dicts?q=amo&d=2&dict=GAF&in=ls&o=0&o=1&save=1&embedded=1&scale=90"
      )
    ).toBe("/v2/dicts?q=amo&embedded=1&scale=90");
  });

  test("works on a URL with nothing to drop", () => {
    expect(ownSettingsHref("/v2/dicts?q=amo")).toBe("/v2/dicts?q=amo");
    expect(ownSettingsHref("/v2/dicts")).toBe("/v2/dicts");
  });
});
