import {
  buildJsDelivrBaseUrl,
  buildExperimentalTextFileUrls,
  buildRawGithubBaseUrl,
  type ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";

describe("catalog_types URL builders", () => {
  const sampleSource: ExperimentalTextSourceRepoMeta = {
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

  it("builds primary raw.githubusercontent.com and fallback jsDelivr URLs", () => {
    const urls = buildExperimentalTextFileUrls(
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
});
