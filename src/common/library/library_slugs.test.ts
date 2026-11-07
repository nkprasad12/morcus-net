import {
  authorCodeFromSlug,
  RETIRED_AUTHOR_SLUGS,
  urlifyAuthor,
} from "@/common/library/library_slugs";

describe("authorCodeFromSlug", () => {
  it.each([
    ["nepos", "Nepos"],
    ["pliny_elder", "PlinyElder"],
    ["historia_augusta", "HistoriaAugusta"],
    ["pseudo-caesar", "PseudoCaesar"],
  ])("maps %s to %s", (slug, code) => {
    expect(authorCodeFromSlug(slug)).toBe(code);
  });
});

describe("urlifyAuthor", () => {
  it.each([
    ["Cornelius Nepos", "nepos"],
    ["Seneca the Elder", "seneca_elder"],
    ["Seneca, Lucius Annaeus", "seneca_younger"],
    ["Minucius Felix", "minucius_felix"],
  ])("maps %s to %s", (author, slug) => {
    expect(urlifyAuthor(author)).toBe(slug);
  });
});

describe("RETIRED_AUTHOR_SLUGS", () => {
  const current = new Set(RETIRED_AUTHOR_SLUGS.keys());
  const retired = [...RETIRED_AUTHOR_SLUGS.values()].flat();

  it("never retires a slug that is still current", () => {
    expect(retired.filter((slug) => current.has(slug))).toEqual([]);
  });

  it("retires each slug only once", () => {
    expect(new Set(retired).size).toBe(retired.length);
  });
});
