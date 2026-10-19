import {
  applyDictSearch,
  applyUnscopedDictSearch,
  buildDictUrl,
  cleanDictQuery,
  dictUrlBuilder,
} from "@/web/ui/dict/search/dict_params.common";

describe("cleanDictQuery", () => {
  test.each([
    ["1 ab", "ab"],
    ["ab 1", "ab"],
    ["ab, 1", "ab"],
    ["1. ab", "ab"],
    ["  2   bellum  ", "bellum"],
    ["bellum 3", "bellum"],
    ["1", "1"],
    ["42", "42"],
    ["ab 1 c", "ab 1 c"],
    ["", ""],
    ["   ", ""],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(cleanDictQuery(raw)).toBe(expected);
  });
});

describe("applyDictSearch", () => {
  test("sets the search, drops legacy params, and keeps the rest, including lang", () => {
    const params = new URLSearchParams(
      "embedded=1&lang=La&dict=LS&in=1&q=old&scale=120"
    );
    applyDictSearch(params, { q: "amo", d: "an", inflected: false });
    expect(params.toString()).toBe(
      "embedded=1&lang=La&q=amo&scale=120&d=an&o=0"
    );
  });
});

describe("applyUnscopedDictSearch", () => {
  test("drops lang and every dictionary param, and keeps the frame", () => {
    const params = new URLSearchParams(
      "q=arma&lang=La&o=1&embedded=1&scale=120&d=2&dict=LS&in=1"
    );
    applyUnscopedDictSearch(params, { q: "love", inflected: true });
    expect(params.toString()).toBe("q=love&o=1&embedded=1&scale=120");
  });
});

describe("buildDictUrl", () => {
  // `lang` precedes `o` so embedded lookups keep the reader's long-standing
  // `q, lang, o, embedded` order.
  test("orders q, d, lang, o, embedded, save", () => {
    expect(
      buildDictUrl({
        q: "amo",
        d: "an",
        inflected: true,
        lang: "La",
        embedded: "1",
        save: true,
      })
    ).toBe("/dicts?q=amo&d=an&lang=La&o=1&embedded=1&save=1");
  });

  test("omits empty optional params", () => {
    expect(
      buildDictUrl({
        q: "amo",
        d: "3",
        inflected: false,
        lang: null,
        embedded: "",
        save: false,
      })
    ).toBe("/dicts?q=amo&d=3&o=0");
  });

  test("omits d when absent", () => {
    expect(
      buildDictUrl({ q: "arma", inflected: true, lang: "La", embedded: "1" })
    ).toBe("/dicts?q=arma&lang=La&o=1&embedded=1");
  });

  test("encodes Greek and macra", () => {
    expect(buildDictUrl({ q: "λόγος", d: "an", inflected: true })).toBe(
      "/dicts?q=%CE%BB%CF%8C%CE%B3%CE%BF%CF%82&d=an&o=1"
    );
    expect(buildDictUrl({ q: "amō", d: "an", inflected: true })).toBe(
      "/dicts?q=am%C5%8D&d=an&o=1"
    );
  });
});

describe("dictUrlBuilder", () => {
  test("matches buildDictUrl for every q", () => {
    const options = {
      d: "an",
      inflected: true,
      lang: "La",
      embedded: "1",
    } as const;
    const hrefFor = dictUrlBuilder(options);
    for (const q of [
      "amo",
      "amō",
      "λόγος",
      "a b",
      "quis?",
      "it's",
      "",
      "x&y=z",
    ]) {
      expect(hrefFor(q)).toBe(buildDictUrl({ ...options, q }));
    }
  });

  test("omits absent params like buildDictUrl", () => {
    expect(dictUrlBuilder({ inflected: false })("arma")).toBe(
      "/dicts?q=arma&o=0"
    );
  });
});
