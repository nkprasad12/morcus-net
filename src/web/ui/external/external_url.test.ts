import {
  EXTERNAL_READER_PATH,
  buildExternalReaderUrl,
  parseExternalReaderParams,
} from "@/web/ui/external/external_url.common";

describe("buildExternalReaderUrl", () => {
  test("matches V1's path at the root", () => {
    expect(EXTERNAL_READER_PATH).toBe("/externalReader");
    expect(buildExternalReaderUrl()).toBe("/externalReader");
  });

  test("encodes a URL import", () => {
    expect(
      buildExternalReaderUrl({ url: "https://thelatinlibrary.com/a b.html" })
    ).toBe("/externalReader?url=https%3A%2F%2Fthelatinlibrary.com%2Fa+b.html");
  });

  test("omits the default line mode but keeps others", () => {
    expect(buildExternalReaderUrl({ local: "k", lines: "keep" })).toBe(
      "/externalReader?local=k"
    );
    expect(buildExternalReaderUrl({ local: "k", lines: "verse" })).toBe(
      "/externalReader?local=k&lines=verse"
    );
  });

  test("url takes precedence over local", () => {
    expect(buildExternalReaderUrl({ url: "a.com", local: "k" })).toBe(
      "/externalReader?url=a.com"
    );
  });

  test("carries the dictionary query", () => {
    expect(buildExternalReaderUrl({ local: "k", q: "arma" })).toBe(
      "/externalReader?local=k&q=arma"
    );
  });
});

describe("parseExternalReaderParams", () => {
  test("round-trips through the builder", () => {
    const params = {
      url: "https://a.com/x?y=1",
      lines: "prose" as const,
      q: "virum",
    };
    const url = buildExternalReaderUrl(params);
    expect(parseExternalReaderParams(url.split("?")[1])).toEqual({
      ...params,
      local: undefined,
    });
  });

  test("falls back to defaults for missing or malformed values", () => {
    expect(parseExternalReaderParams("lines=sonnet&url=%20%20")).toEqual({
      url: undefined,
      local: undefined,
      lines: "keep",
      q: undefined,
    });
  });

  test("ignores local when url is present", () => {
    expect(
      parseExternalReaderParams("url=a.com&local=k").local
    ).toBeUndefined();
  });

  test("accepts legacy V1 fromUrl parameter as fallback for url", () => {
    expect(
      parseExternalReaderParams("fromUrl=https%3A%2F%2Fa.com%2Fx")
    ).toEqual({
      url: "https://a.com/x",
      local: undefined,
      lines: "keep",
      q: undefined,
    });
  });

  test("accepts URLSearchParams", () => {
    expect(
      parseExternalReaderParams(new URLSearchParams({ local: "k" })).local
    ).toBe("k");
  });
});
