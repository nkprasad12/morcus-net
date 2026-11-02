/**
 * @jest-environment jsdom
 */

import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
  type ExperimentalTextCatalogEntry,
  type ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import {
  EXPERIMENTAL_TEXTS_PATH,
  EXPERIMENTAL_TEXT_READER_ROLES,
  buildExperimentalTextsUrl,
  renderExperimentalTextReaderHostHtml,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";

const COMMIT = "8c651f8500000000000000000000000000000000";
const REPO = "nkprasad12/patrologia_latina-dev";

const SAMPLE_SOURCE: ExperimentalTextSourceRepoMeta = {
  source: "patrologia_latina",
  label: "Patrologia Latina",
  repo: REPO,
  commit: COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(REPO, COMMIT),
  fallbackBaseUrl: buildJsDelivrBaseUrl(REPO, COMMIT),
  license: "CC BY-SA 4.0",
};

const SAMPLE_ENTRY: ExperimentalTextCatalogEntry = {
  id: "pl/stoa0022.stoa002.opp-lat1",
  source: "patrologia_latina",
  format: "tei",
  author: "Ambrose",
  title: "De Fide Ad Gratianum Augustum",
  period: "ancient",
  urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
  volumeLabel: "PL 16",
  files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
  sourceUrl: `https://github.com/${REPO}/blob/${COMMIT}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
  license: "CC BY-SA 4.0",
};

/** The JSON text inside the host's payload `<script>`. */
function payloadText(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const script = doc.querySelector(
    `script[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.payload}"]`
  );
  if (script === null) throw new Error("No payload script");
  return script.textContent ?? "";
}

describe("buildExperimentalTextsUrl", () => {
  it("builds the catalog URL", () => {
    expect(buildExperimentalTextsUrl()).toBe(EXPERIMENTAL_TEXTS_PATH);
    expect(buildExperimentalTextsUrl({ page: "col-529" })).toBe(
      EXPERIMENTAL_TEXTS_PATH
    );
  });

  it("builds reader URLs, with and without a page", () => {
    expect(
      buildExperimentalTextsUrl({ open: "pl/stoa0022.stoa002.opp-lat1" })
    ).toBe("/experimentalTexts?open=pl%2Fstoa0022.stoa002.opp-lat1");
    expect(
      buildExperimentalTextsUrl({
        open: "pl/stoa0022.stoa002.opp-lat1",
        page: "col-529",
      })
    ).toBe(
      "/experimentalTexts?open=pl%2Fstoa0022.stoa002.opp-lat1&page=col-529"
    );
  });
});

describe("renderExperimentalTextReaderHostHtml", () => {
  it("renders the <morcus-experimental-text-reader> host with every data-role", () => {
    const markup = renderExperimentalTextReaderHostHtml({
      entry: SAMPLE_ENTRY,
      sourceMeta: SAMPLE_SOURCE,
      initialSection: "1",
      backHref: "/experimentalTexts",
    });
    expect(markup).toContain("<morcus-experimental-text-reader");
    for (const role of Object.values(EXPERIMENTAL_TEXT_READER_ROLES)) {
      expect(markup).toContain(`data-role="${role}"`);
    }
    expect(markup).toContain(SAMPLE_ENTRY.title);
  });

  it("escapes the payload so no value can close the <script> early", () => {
    const hostile = `</script><script>alert(1)</script><!-- & -->`;
    const payload = {
      entry: { ...SAMPLE_ENTRY, title: hostile, author: "A & B <c>" },
      sourceMeta: SAMPLE_SOURCE,
      backHref: "/experimentalTexts",
    };
    const markup = renderExperimentalTextReaderHostHtml(payload);

    const text = payloadText(markup);
    expect(text).not.toMatch(/[<>&]/);
    expect(text).toContain("\\u003c/script\\u003e");
    // The escapes are plain JSON, so the payload round-trips unchanged.
    expect(JSON.parse(text)).toEqual(payload);
    // Only the payload's own script element exists.
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelectorAll("script")).toHaveLength(1);
  });
});
