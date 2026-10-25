import {
  dictPageTitle,
  dictPageTitleForUrl,
} from "@/web/ui/dict/dict_title.common";

describe("dictPageTitle", () => {
  test("query, ID lookup, and the landing page", () => {
    expect(dictPageTitle("amo")).toBe(
      "amo | Dictionaries | Morcus Latin Tools"
    );
    expect(dictPageTitle("n20077", true)).toBe(
      "ID n20077 | Dictionaries | Morcus Latin Tools"
    );
    expect(dictPageTitle("")).toBe("Dictionaries | Morcus Latin Tools");
  });
});

describe("dictPageTitleForUrl", () => {
  const forUrl = (href: string) =>
    dictPageTitleForUrl(new URL(href, "http://localhost"));

  test("a search titles by q, cleaned as the server does", () => {
    expect(forUrl("/dicts?q=amo&d=3&o=1")).toBe(
      "amo | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts?q=+amo+")).toBe(
      "amo | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts?q=1+ab")).toBe(
      "ab | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts?q=ab+1")).toBe(
      "ab | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts?q=1")).toBe("1 | Dictionaries | Morcus Latin Tools");
    expect(forUrl("/dicts")).toBe("Dictionaries | Morcus Latin Tools");
  });

  test("an entry page titles by its id and ignores q", () => {
    expect(forUrl("/dicts/id/n20077")).toBe(
      "ID n20077 | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts/id/ra_dog?q=amo")).toBe(
      "ID ra_dog | Dictionaries | Morcus Latin Tools"
    );
    expect(forUrl("/dicts/id/%E1%BC%80")).toBe(
      "ID \u1f00 | Dictionaries | Morcus Latin Tools"
    );
  });

  test("a malformed id keeps its raw text", () => {
    expect(forUrl("/dicts/id/%E0%A4%A")).toBe(
      "ID %E0%A4%A | Dictionaries | Morcus Latin Tools"
    );
  });
});
