import {
  SETTINGS_PARAMS,
  ownSettingsHref,
} from "@/web/ui/dict/settings/dict_settings_href.common";

describe("dict_settings_href.common", () => {
  test("SETTINGS_PARAMS lists all dictionary settings and save params", () => {
    expect(SETTINGS_PARAMS).toEqual(["d", "dict", "in", "o", "save"]);
  });

  test("drops every settings parameter and keeps the rest", () => {
    expect(
      ownSettingsHref(
        "/dicts?q=amo&d=2&dict=GAF&in=ls&o=0&o=1&save=1&embedded=1&scale=90"
      )
    ).toBe("/dicts?q=amo&embedded=1&scale=90");
  });

  test("works on a URL with nothing to drop", () => {
    expect(ownSettingsHref("/dicts?q=amo")).toBe("/dicts?q=amo");
    expect(ownSettingsHref("/dicts")).toBe("/dicts");
  });

  test("keepInflection keeps o (and the scope) for scoped views", () => {
    expect(
      ownSettingsHref(
        "/dicts?q=amo&lang=La&o=1&embedded=1&scale=90&d=2&dict=GAF&in=ls&save=1",
        { keepInflection: true }
      )
    ).toBe("/dicts?q=amo&lang=La&o=1&embedded=1&scale=90");
  });
});
