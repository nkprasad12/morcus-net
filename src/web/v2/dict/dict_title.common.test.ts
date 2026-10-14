import {
  dictPageTitle,
  dictPageTitleForUrl,
} from "@/web/v2/dict/dict_title.common";

describe("dictPageTitle", () => {
  test("query, ID lookup, and the landing page", () => {
    expect(dictPageTitle("amo")).toBe("amo - Morcus Dictionary");
    expect(dictPageTitle("n20077", true)).toBe("ID n20077 - Morcus Dictionary");
    expect(dictPageTitle("")).toBe("Morcus Dictionary");
  });
});

describe("dictPageTitleForUrl", () => {
  const forUrl = (href: string) =>
    dictPageTitleForUrl(new URL(href, "http://localhost"));

  test("a search titles by q, cleaned as the server does", () => {
    expect(forUrl("/v2/dicts?q=amo&d=3&o=1")).toBe("amo - Morcus Dictionary");
    expect(forUrl("/v2/dicts?q=+amo+")).toBe("amo - Morcus Dictionary");
    expect(forUrl("/v2/dicts")).toBe("Morcus Dictionary");
  });

  test("an entry page titles by its id and ignores q", () => {
    expect(forUrl("/v2/dicts/id/n20077")).toBe("ID n20077 - Morcus Dictionary");
    expect(forUrl("/v2/dicts/id/ra_dog?q=amo")).toBe(
      "ID ra_dog - Morcus Dictionary"
    );
    expect(forUrl("/v2/dicts/id/%E1%BC%80")).toBe(
      "ID \u1f00 - Morcus Dictionary"
    );
  });

  test("a malformed id keeps its raw text", () => {
    expect(forUrl("/v2/dicts/id/%E0%A4%A")).toBe(
      "ID %E0%A4%A - Morcus Dictionary"
    );
  });
});
