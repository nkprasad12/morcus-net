import {
  applyDictSearch,
  buildDictUrl,
} from "@/web/v2/dict/dict_params.common";

describe("applyDictSearch", () => {
  test("sets the search, drops legacy params and keeps the rest", () => {
    const params = new URLSearchParams(
      "embedded=1&dict=LS&in=1&q=old&scale=120"
    );
    applyDictSearch(params, { q: "amo", d: "an", inflected: false });
    expect(params.toString()).toBe("embedded=1&q=amo&scale=120&d=an&o=0");
  });
});

describe("buildDictUrl", () => {
  // `lang` precedes `o` so embedded lookups keep the reader's long-standing
  // `q, lang, o, embedded` order.
  test("orders q, d, lang, o, embedded", () => {
    expect(
      buildDictUrl({
        q: "amo",
        d: "an",
        inflected: true,
        lang: "La",
        embedded: "1",
      })
    ).toBe("/v2/dicts?q=amo&d=an&lang=La&o=1&embedded=1");
  });

  test("omits empty optional params", () => {
    expect(
      buildDictUrl({
        q: "amo",
        d: "3",
        inflected: false,
        lang: null,
        embedded: "",
      })
    ).toBe("/v2/dicts?q=amo&d=3&o=0");
  });

  test("omits d when absent", () => {
    expect(
      buildDictUrl({ q: "arma", inflected: true, lang: "La", embedded: "1" })
    ).toBe("/v2/dicts?q=arma&lang=La&o=1&embedded=1");
  });

  test("encodes Greek and macra", () => {
    expect(buildDictUrl({ q: "λόγος", d: "an", inflected: true })).toBe(
      "/v2/dicts?q=%CE%BB%CF%8C%CE%B3%CE%BF%CF%82&d=an&o=1"
    );
    expect(buildDictUrl({ q: "amō", d: "an", inflected: true })).toBe(
      "/v2/dicts?q=am%C5%8D&d=an&o=1"
    );
  });
});
