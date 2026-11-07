/**
 * @jest-environment jsdom
 */

import { renderCorpusHelp } from "@/web/ui/corpus/corpus_help.server";
import { CORPUS_REFERENCE_PATH } from "@/web/ui/corpus/corpus_params.common";
import {
  buildCorpusReferencePageHtml,
  renderCorpusReferenceContentHtml,
  renderCorpusReferencePageHtml,
  resolveAuthorDisplayNames,
} from "@/web/ui/corpus/corpus_reference.server";
import {
  INFLECTION_CATEGORIES,
  SPECIAL_KEYWORDS,
  resolveKeyword,
  validateQuery,
} from "@/web/ui/corpus/corpus_syntax.common";
import { CORPUS_TEST_AUTHORS } from "@/web/ui/testing/fake_corpus_engine";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function text(node: Element | Document | null): string {
  const root = node instanceof Document ? node.documentElement : node;
  return (root?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("corpus reference page (/corpus/reference)", () => {
  test("lists every @keyword, one-letter shorthand, and long/short inflection value", () => {
    const doc = parse(renderCorpusReferenceContentHtml(CORPUS_TEST_AUTHORS));
    const pageText = text(doc);
    const inflectionsSection = text(doc.getElementById("inflections"));

    for (const keyword of SPECIAL_KEYWORDS) {
      expect(pageText).toContain(`@${keyword}`);
      const short = keyword[0];
      expect(resolveKeyword(short)).toBe(keyword);
      expect(pageText).toContain(`@${short}`);
    }

    for (const [category, values] of INFLECTION_CATEGORIES) {
      expect(inflectionsSection).toContain(`@${category}`);
      expect(inflectionsSection).toContain(`@${category[0]}`);
      for (const [longVal, shortVal] of values) {
        expect(inflectionsSection).toContain(longVal);
        expect(inflectionsSection).toContain(shortVal);
      }
    }
  });

  test("every query marked with data-example is valid under validateQuery", () => {
    const doc = parse(renderCorpusReferenceContentHtml(CORPUS_TEST_AUTHORS));
    const examples = Array.from(
      doc.querySelectorAll<HTMLElement>("[data-example]")
    ).map((el) => el.dataset.example ?? "");

    expect(examples.length).toBeGreaterThanOrEqual(15);
    for (const query of examples) {
      expect({
        query,
        error: validateQuery(query, CORPUS_TEST_AUTHORS),
      }).toEqual({
        query,
        error: null,
      });
    }
  });

  test("every in-page #hash link on /corpus/reference and from the syntax guide resolves to an id", () => {
    const refDoc = parse(renderCorpusReferenceContentHtml(CORPUS_TEST_AUTHORS));
    const inPageHashes = Array.from(
      refDoc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    ).map((a) => a.getAttribute("href")?.slice(1) ?? "");

    expect(inPageHashes.length).toBeGreaterThan(0);
    for (const id of inPageHashes) {
      expect({ id, exists: refDoc.getElementById(id) !== null }).toEqual({
        id,
        exists: true,
      });
    }

    const helpDoc = parse(renderCorpusHelp());
    const helpRefLinks = Array.from(
      helpDoc.querySelectorAll<HTMLAnchorElement>(
        `a[href^="${CORPUS_REFERENCE_PATH}"]`
      )
    ).map((a) => a.getAttribute("href") ?? "");

    expect(helpRefLinks).toEqual(
      expect.arrayContaining([
        CORPUS_REFERENCE_PATH,
        `${CORPUS_REFERENCE_PATH}#inflections`,
        `${CORPUS_REFERENCE_PATH}#proximity`,
        `${CORPUS_REFERENCE_PATH}#authors`,
      ])
    );

    for (const href of helpRefLinks) {
      const hashIdx = href.indexOf("#");
      if (hashIdx === -1) continue;
      const targetId = href.slice(hashIdx + 1);
      expect({
        href,
        exists: refDoc.getElementById(targetId) !== null,
      }).toEqual({
        href,
        exists: true,
      });
    }
  });

  test("renders sorted authors, full display names from library summaries, and work codes without query links", async () => {
    const displayNames = await resolveAuthorDisplayNames(CORPUS_TEST_AUTHORS);
    expect(displayNames.get("Caesar")).toBe("Julius Caesar");

    const doc = parse(await buildCorpusReferencePageHtml(CORPUS_TEST_AUTHORS));
    expect(doc.title).toBe("Corpus search reference | Morcus Latin Tools");
    expect(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe("https://morcus.net/corpus/reference");

    // Highlights Corpus in the nav bar, and loads only common.js.
    expect(
      doc
        .querySelector("nav.nav-desktop a.nav-link.active")
        ?.getAttribute("href")
    ).toBe("/corpus");
    const scripts = Array.from(
      doc.querySelectorAll<HTMLScriptElement>('script[type="module"]')
    ).map((s) => s.getAttribute("src"));
    expect(scripts).toEqual(["/assets/common.js"]);

    const authorsSection = doc.getElementById("authors")!;
    const cardIds = Array.from(
      authorsSection.querySelectorAll(".corpus-ref-author-card")
    ).map((el) => el.id);
    expect(cardIds).toEqual([
      "author-caesar",
      "author-cicero",
      "author-senecamajor",
    ]);

    const caesarCard = doc.getElementById("author-caesar")!;
    expect(text(caesarCard)).toContain("#Caesar");
    expect(text(caesarCard)).toContain("Julius Caesar");
    expect(text(caesarCard)).toContain("(2 works)");
    expect(text(caesarCard)).toContain("#Caesar/DeBelloCivili");
    expect(text(caesarCard)).toContain("De Bello Civili");
    expect(text(caesarCard)).toContain("#Caesar/DeBelloGallico");
    expect(text(caesarCard)).toContain("De Bello Gallico");

    // Author/work entries are reference codes, not query links.
    const authorLinks = Array.from(
      authorsSection.querySelectorAll<HTMLAnchorElement>("a[href]")
    ).map((a) => a.getAttribute("href"));
    expect(authorLinks).toEqual([
      "#author-caesar",
      "#author-cicero",
      "#author-senecamajor",
    ]);
  });

  test("degrades cleanly when the author list is unavailable", () => {
    const doc = parse(renderCorpusReferencePageHtml(undefined));
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
    expect(text(doc.getElementById("authors"))).toContain(
      "The corpus author and work list is not available on this server."
    );
  });
});
