import {
  buildJsDelivrBaseUrl,
  buildOpenTextFileUrls,
  buildRawGithubBaseUrl,
  type OpenTextCatalogEntry,
  type OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import {
  OPEN_TEXTS_PATH,
  OPEN_TEXT_READER_ROLES,
  buildOpenTextsUrl,
  renderOpenTextReaderHostHtml,
} from "@/web/ui/open_texts/open_texts_contract.common";
import { TEXTS_TABS, TEXTS_TAB_PATHS } from "@/web/ui/shell/texts_tabs.common";

describe("Open Texts catalog_types and shared contracts", () => {
  const sampleSource: OpenTextSourceRepoMeta = {
    source: "patrologia_latina",
    label: "Patrologia Latina",
    repo: "nkprasad12/patrologia_latina-dev",
    commit: "8c651f8500000000000000000000000000000000",
    rawBaseUrl: buildRawGithubBaseUrl(
      "nkprasad12/patrologia_latina-dev",
      "8c651f8500000000000000000000000000000000"
    ),
    fallbackBaseUrl: buildJsDelivrBaseUrl(
      "nkprasad12/patrologia_latina-dev",
      "8c651f8500000000000000000000000000000000"
    ),
    license: "CC BY-SA 4.0",
  };

  const sampleEntry: OpenTextCatalogEntry = {
    id: "pl/stoa0022.stoa002.opp-lat1",
    source: "patrologia_latina",
    format: "tei",
    author: "Ambrose",
    title: "De Fide Ad Gratianum Augustum",
    period: "patristic",
    urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
    volumeLabel: "PL 16",
    files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
    sourceUrl:
      "https://github.com/nkprasad12/patrologia_latina-dev/blob/8c651f8500000000000000000000000000000000/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml",
    license: "CC BY-SA 4.0",
  };

  it("builds primary raw.githubusercontent.com and fallback jsDelivr URLs", () => {
    const urls = buildOpenTextFileUrls(
      sampleSource,
      "/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"
    );
    expect(urls).toEqual({
      primaryUrl:
        "https://raw.githubusercontent.com/nkprasad12/patrologia_latina-dev/8c651f8500000000000000000000000000000000/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml",
      fallbackUrl:
        "https://cdn.jsdelivr.net/gh/nkprasad12/patrologia_latina-dev@8c651f8500000000000000000000000000000000/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml",
    });
  });

  it("builds canonical /opentexts catalog and reader URLs", () => {
    expect(buildOpenTextsUrl()).toBe(OPEN_TEXTS_PATH);
    expect(
      buildOpenTextsUrl({
        q: "ambrose",
        period: "patristic",
        source: "patrologia_latina",
      })
    ).toBe("/opentexts?q=ambrose&period=patristic&source=patrologia_latina");
    expect(
      buildOpenTextsUrl({
        open: "pl/stoa0022.stoa002.opp-lat1",
        page: "col-529",
      })
    ).toBe("/opentexts?open=pl%2Fstoa0022.stoa002.opp-lat1&page=col-529");
    expect(
      buildOpenTextsUrl({
        open: "pl/stoa0022.stoa002.opp-lat1",
        section: "2",
      })
    ).toBe("/opentexts?open=pl%2Fstoa0022.stoa002.opp-lat1&section=2");
  });

  it("renders the <morcus-open-text-reader> host HTML with all required data-roles", () => {
    const html = renderOpenTextReaderHostHtml({
      entry: sampleEntry,
      sourceMeta: sampleSource,
      initialSection: "1",
      backHref: "/opentexts",
    });
    expect(html).toContain("<morcus-open-text-reader");
    for (const role of Object.values(OPEN_TEXT_READER_ROLES)) {
      expect(html).toContain(`data-role="${role}"`);
    }
    expect(html).toContain(sampleEntry.title);
  });

  it("defines the three Texts tabs in Decision #14 order", () => {
    expect(TEXTS_TABS.map((t) => t.id)).toEqual([
      "library",
      "opentexts",
      "external",
    ]);
    expect(TEXTS_TAB_PATHS).toEqual({
      library: "/library",
      opentexts: "/opentexts",
      external: "/externalReader",
    });
  });
});
