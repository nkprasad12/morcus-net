/**
 * Route-to-Bundle Conformance Harness.
 *
 * Ensures that every UI V2 server route (and every partial/fragment HTML
 * response swapped into that route at runtime) only renders `<morcus-*>` custom
 * elements and selector-bound behaviors that are provided by the `<script>`
 * chunks emitted on that route, and that chunk `<script>` tags are emitted in
 * `dependOn` dependency order without `async`.
 *
 * Note on client-created elements: Elements referenced or constructed only in
 * browser code (such as `MorcusReaderView` inside `external_loader.client.ts`)
 * cannot be seen by a server HTML scan and instead rely on the bundler's
 * `dependOn` graph (`external` -> `reader`) and the route emitting `reader.js`.
 *
 * @jest-environment jsdom
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { XmlNode } from "@/common/xml/xml_node";
import {
  V2_CHUNK_ENTRIES,
  type V2JsChunkName,
  type V2JsEntryName,
} from "@/bundler/v2_build_contract";
import { renderAboutPageHtml } from "@/web/v2/about/about.server";
import { CONTEXT_LEN, PAGE_SIZE } from "@/web/v2/corpus/corpus_params.common";
import { runCorpusSearch } from "@/web/v2/corpus/corpus_query.server";
import {
  renderCorpusPageHtml,
  renderCorpusPartialHtml,
  renderCorpusUnavailableHtml,
} from "@/web/v2/corpus/corpus_view.server";
import {
  renderDictPageHtml,
  renderDictResultsHtml,
} from "@/web/v2/dict/dict_page.server";
import {
  renderExternalLandingPageHtml,
  renderExternalLocalPageHtml,
  renderExternalReaderPageHtml,
} from "@/web/v2/external/external.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { renderNotFoundPageHtml } from "@/web/v2/library/not_found.server";
import {
  renderReaderPageHtml,
  renderReaderPartialHtml,
} from "@/web/v2/reader/reader.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/shell/asset_manifest.server", () => {
  const actual = jest.requireActual("@/web/v2/shell/asset_manifest.server");
  return {
    ...actual,
    getV2AssetHref: (name: string) => `/v2/assets/${name}`,
    getV2CriticalCss: () => "body{background-color:var(--bg)}",
    getV2CriticalJs: () => "/* critical js */",
  };
});

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

interface EntryGraphNode {
  readonly entryName: V2JsEntryName;
  readonly chunkFile: V2JsChunkName;
  readonly importPath: string;
  readonly dependOn?: V2JsEntryName;
}

/**
 * Extracts the JS entry chunk graph directly from `V2_CHUNK_ENTRIES`
 * (the bundler's `source.entry` config) so the test never relies on a
 * hand-maintained bundle list.
 */
function extractEntryGraph(): Map<V2JsChunkName, EntryGraphNode> {
  const graph = new Map<V2JsChunkName, EntryGraphNode>();

  for (const [name, def] of Object.entries(V2_CHUNK_ENTRIES)) {
    const entryName = name as V2JsEntryName;
    const chunkFile = `${entryName}.js` as V2JsChunkName;
    graph.set(chunkFile, {
      entryName,
      chunkFile,
      importPath: def.import,
      dependOn: def.dependOn,
    });
  }

  return graph;
}

/**
 * Evaluates each entry manifest in an isolated Jest module registry (loading
 * its `dependOn` ancestor chain first) to discover the exact set of
 * `<morcus-*>` custom elements registered by each chunk.
 */
function deriveChunkElementMap(
  entryGraph: ReadonlyMap<V2JsChunkName, EntryGraphNode>
): Map<V2JsChunkName, Set<string>> {
  const repoRoot = process.cwd();
  const cumulativeByChunk = new Map<V2JsChunkName, Set<string>>();

  function getCumulativeTags(chunkFile: V2JsChunkName): Set<string> {
    const cached = cumulativeByChunk.get(chunkFile);
    if (cached) return cached;

    const node = entryGraph.get(chunkFile);
    if (!node) {
      throw new Error(`Unknown chunk ${chunkFile}`);
    }

    const chain: EntryGraphNode[] = [];
    let cursor: EntryGraphNode | undefined = node;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.dependOn
        ? entryGraph.get(`${cursor.dependOn}.js` as V2JsChunkName)
        : undefined;
    }

    let registered = new Set<string>();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baseElement = require("@/web/v2/core/base_element.client") as {
        getRegisteredElementTags: () => ReadonlySet<string>;
      };
      for (const step of chain) {
        const absPath = path.resolve(repoRoot, step.importPath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(absPath);
      }
      registered = new Set(baseElement.getRegisteredElementTags());
    });

    cumulativeByChunk.set(chunkFile, registered);
    return registered;
  }

  const ownedByChunk = new Map<V2JsChunkName, Set<string>>();
  for (const [chunkFile, node] of entryGraph.entries()) {
    const cumulative = getCumulativeTags(chunkFile);
    const parentCumulative = node.dependOn
      ? getCumulativeTags(`${node.dependOn}.js` as V2JsChunkName)
      : new Set<string>();
    const owned = new Set<string>();
    for (const tag of cumulative) {
      if (!parentCumulative.has(tag)) {
        owned.add(tag);
      }
    }
    ownedByChunk.set(chunkFile, owned);
  }

  return ownedByChunk;
}

/**
 * Selector-bound behaviors (modules that attach via CSS selector rather than
 * `<morcus-*>` custom element tags). The chunk that owns each selector is
 * derived from which `*_entry.client.ts` file imports `moduleImportSubstring`.
 */
const SELECTOR_BOUND_BEHAVIORS: readonly {
  readonly name: string;
  readonly selector: string;
  readonly moduleImportSubstring: string;
}[] = [
  {
    name: "abbr_popover (.lsHover)",
    selector: ".lsHover",
    moduleImportSubstring: "@/web/v2/dict/abbr_popover.client",
  },
  {
    name: "deferred_iframe (iframe[data-deferred-src], iframe[data-src])",
    selector: "iframe[data-deferred-src], iframe[data-src]",
    moduleImportSubstring: "@/web/v2/core/deferred_iframe.client",
  },
  {
    name: "back_to_top (.back-to-top)",
    selector: ".back-to-top",
    moduleImportSubstring: "@/web/v2/core/back_to_top.client",
  },
];

function deriveSelectorChunkMap(
  entryGraph: ReadonlyMap<V2JsChunkName, EntryGraphNode>
): Map<string, V2JsChunkName> {
  const repoRoot = process.cwd();
  const map = new Map<string, V2JsChunkName>();

  for (const behavior of SELECTOR_BOUND_BEHAVIORS) {
    const matchingChunks: V2JsChunkName[] = [];
    for (const [chunkFile, node] of entryGraph.entries()) {
      const absPath = path.resolve(repoRoot, node.importPath);
      const source = fs.readFileSync(absPath, "utf8");
      if (source.includes(`"${behavior.moduleImportSubstring}"`)) {
        matchingChunks.push(chunkFile);
      }
    }
    if (matchingChunks.length !== 1) {
      throw new Error(
        `Expected selector behavior '${
          behavior.name
        }' to be imported by exactly 1 entry file, found: [${matchingChunks.join(
          ", "
        )}]`
      );
    }
    map.set(behavior.selector, matchingChunks[0]);
  }

  return map;
}

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function extractEmittedScriptChunks(doc: Document): {
  chunks: V2JsChunkName[];
  scripts: HTMLScriptElement[];
} {
  const scripts = Array.from(
    doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')
  );
  const chunks = scripts.map((s) => {
    const src = s.getAttribute("src") ?? "";
    const match = src.match(/^\/v2\/assets\/([a-z]+\.js)$/);
    if (!match) {
      throw new Error(`Unexpected module script src: ${src}`);
    }
    return match[1] as V2JsChunkName;
  });
  return { chunks, scripts };
}

/**
 * Collects all `<morcus-*>` tags in `root`, recursively descending into
 * `<template>` fragments (such as `<template data-slot="...">` responses
 * returned by `?partial=1` endpoints).
 */
function collectMorcusTags(root: ParentNode): Set<string> {
  const tags = new Set<string>();
  function visit(node: ParentNode): void {
    for (const el of Array.from(node.querySelectorAll("*"))) {
      const tag = el.tagName.toLowerCase();
      if (tag.startsWith("morcus-")) {
        tags.add(tag);
      }
      if (el instanceof HTMLTemplateElement) {
        visit(el.content);
      }
    }
  }
  visit(root);
  return tags;
}

/**
 * Checks whether `selector` matches any element in `root` or inside any
 * `<template>` fragment within `root`.
 */
function hasSelectorMatch(root: ParentNode, selector: string): boolean {
  if (root.querySelector(selector) !== null) {
    return true;
  }
  for (const tmpl of Array.from(
    root.querySelectorAll<HTMLTemplateElement>("template")
  )) {
    if (hasSelectorMatch(tmpl.content, selector)) {
      return true;
    }
  }
  return false;
}

interface RouteFixture {
  readonly name: string;
  readonly fullHtml: string;
  readonly partialHtmls?: readonly {
    readonly label: string;
    readonly html: string;
  }[];
  readonly expectDictPrefetch?: boolean;
}

function buildDictSampleResults() {
  return {
    "L&S": [
      {
        entry: new XmlNode(
          "div",
          [["id", "ls-amo-root"]],
          [
            new XmlNode("b", [["class", "lsOrth"]], ["amo"]),
            " ",
            new XmlNode(
              "span",
              [
                ["class", "lsHover"],
                ["title", "Cicero"],
              ],
              ["Cic."]
            ),
            " ",
            new XmlNode("span", [["class", "lsQuote"]], ["Gallia est omnis"]),
          ]
        ),
        outline: {
          mainKey: "amo",
          mainSection: {
            text: "amo",
            level: 0,
            ordinal: "0",
            sectionId: "ls-amo-root",
          },
          senses: [],
        },
      },
    ],
  };
}

describe("Route-to-Bundle Conformance Harness", () => {
  const entryGraph = extractEntryGraph();
  const chunkElementMap = deriveChunkElementMap(entryGraph);
  const selectorChunkMap = deriveSelectorChunkMap(entryGraph);

  test("every custom element is registered by exactly one entry chunk", () => {
    const seen = new Map<string, V2JsChunkName>();
    for (const [chunkFile, tags] of chunkElementMap.entries()) {
      expect(tags.size).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(seen.get(tag)).toBeUndefined();
        seen.set(tag, chunkFile);
      }
    }

    let allBarrelTags = new Set<string>();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const baseElement = require("@/web/v2/core/base_element.client") as {
        getRegisteredElementTags: () => ReadonlySet<string>;
      };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/web/v2/v2_elements.client");
      allBarrelTags = new Set(baseElement.getRegisteredElementTags());
    });

    expect(new Set(seen.keys())).toEqual(allBarrelTags);
  });

  test("external_entry depends on reader so client-referenced MorcusReaderView is available", () => {
    const externalNode = entryGraph.get("external.js");
    expect(externalNode?.dependOn).toBe("reader");
    expect(chunkElementMap.get("reader.js")?.has("morcus-reader-view")).toBe(
      true
    );
  });

  test("every route and partial swap template only uses elements and selectors provided by that route's scripts", async () => {
    const dictResults = buildDictSampleResults();
    const readerPartialHtml = await renderReaderPartialHtml({
      workId: "caesar_de_bello_gallico",
      pageId: "1.2",
      view: "parallel",
      query: "Gallia",
    });

    const corpusParams = {
      q: "",
      contextLen: CONTEXT_LEN.default,
      pageSize: PAGE_SIZE.default,
      strictMode: false,
    };
    const corpusEngine = fakeCorpusEngine(() =>
      fakeResult({
        resultStats: { estimatedResults: 200 },
        nextPage: { resultId: 1, resultIndex: 50, candidateIndex: 0 },
      })
    );
    const [corpusLandingView, corpusResultsView] = await Promise.all([
      runCorpusSearch(corpusParams, corpusEngine, CORPUS_TEST_AUTHORS),
      runCorpusSearch(
        { ...corpusParams, q: "@case:dat" },
        corpusEngine,
        CORPUS_TEST_AUTHORS
      ),
    ]);
    const corpusPartialHtml = renderCorpusPartialHtml(corpusResultsView);

    const fixtures: RouteFixture[] = [
      {
        name: "/v2/dicts (landing + results partial)",
        fullHtml: renderDictPageHtml({ query: "" }),
        partialHtmls: [
          {
            label: "renderDictResultsHtml(?partial=1)",
            html: renderDictResultsHtml("amo", dictResults, {
              queriedDicts: ["L&S", "SH"],
            }),
          },
          {
            label: "renderDictResultsHtml(?partial=1, Greek Logeion iframe)",
            html: renderDictResultsHtml("λόγος", undefined),
          },
        ],
      },
      {
        name: "/v2/dicts?q=amo (SSR results with .lsHover, Greek Logeion deferred iframe, and TOC)",
        fullHtml: renderDictPageHtml({
          query: "amo",
          queriedDicts: ["L&S", "SH"],
          results: dictResults,
        }),
      },
      {
        name: "/v2/dicts?embedded=1 (reader dictionary iframe)",
        fullHtml: renderDictPageHtml({
          query: "amo",
          embedded: true,
          queriedDicts: ["L&S"],
          results: dictResults,
        }),
      },
      {
        name: "/v2/library (catalog)",
        fullHtml: await renderLibraryPageHtml(),
      },
      {
        name: "/v2/reader/caesar/de_bello_gallico (single + parallel + page-turn slot partials)",
        fullHtml: await renderReaderPageHtml({
          workId: "caesar_de_bello_gallico",
          view: "parallel",
          query: "Gallia",
        }),
        partialHtmls: [
          {
            label: "renderReaderPartialHtml(?partial=1)",
            html: readerPartialHtml,
          },
        ],
        expectDictPrefetch: true,
      },
      {
        name: "/v2/reader/unknown (404 work not found)",
        fullHtml: renderNotFoundPageHtml({ workSlug: "unknown_work" }),
      },
      {
        name: "/v2/externalReader (landing form — must include reader.js for ?local= and MorcusReaderView)",
        fullHtml: renderExternalLandingPageHtml(),
      },
      {
        name: "/v2/externalReader?url=... (imported URL reading view)",
        fullHtml: renderExternalReaderPageHtml({
          sourceUrl: "https://thelatinlibrary.com/cicero/cat1.shtml",
          text: "Quo usque tandem abutere, Catilina, patientia nostra?",
          lines: "prose",
          query: "",
        }),
        expectDictPrefetch: true,
      },
      {
        name: "/v2/externalReader?local=... (saved local text reading view)",
        fullHtml: renderExternalLocalPageHtml({
          localKey: "local-123",
          lines: "prose",
          query: "",
        }),
        expectDictPrefetch: true,
      },
      {
        name: "/v2/corpus (landing + search results + slot partials)",
        fullHtml: renderCorpusPageHtml(corpusLandingView),
        partialHtmls: [
          {
            label: "corpus results full content",
            html: renderCorpusPageHtml(corpusResultsView),
          },
          {
            label: "renderCorpusPartialHtml(?partial=1)",
            html: corpusPartialHtml,
          },
        ],
      },
      {
        name: "/v2/corpus (503 unavailable)",
        fullHtml: renderCorpusUnavailableHtml("amo"),
      },
      {
        name: "/v2/about",
        fullHtml: renderAboutPageHtml(),
      },
    ];

    for (const fixture of fixtures) {
      const doc = parseDocument(fixture.fullHtml);
      const { chunks, scripts } = extractEmittedScriptChunks(doc);
      expect(chunks.length).toBeGreaterThan(0);

      // 1. Verify script tags do not use `async` and always carry `onerror` fallback
      for (const script of scripts) {
        expect(script.hasAttribute("async")).toBe(false);
        expect(script.getAttribute("onerror")).toContain("data-js-failed");
      }

      // 2. Verify `dependOn` ancestors are emitted before dependents
      const emittedIndex = new Map<V2JsChunkName, number>();
      chunks.forEach((c, idx) => emittedIndex.set(c, idx));
      for (const [idx, chunkFile] of chunks.entries()) {
        const node = entryGraph.get(chunkFile);
        expect(node).toBeDefined();
        if (node?.dependOn) {
          const parentChunk = `${node.dependOn}.js` as V2JsChunkName;
          const parentIdx = emittedIndex.get(parentChunk);
          if (parentIdx === undefined || parentIdx >= idx) {
            throw new Error(
              `Route '${
                fixture.name
              }' emits '${chunkFile}' without emitting its dependOn parent '${parentChunk}' earlier (emitted: [${chunks.join(
                ", "
              )}])`
            );
          }
        }
      }

      // 3. Verify reader routes emit <link rel="prefetch" href="/v2/assets/dict.js">
      const prefetchLink = doc.querySelector(
        'head link[rel="prefetch"][href="/v2/assets/dict.js"]'
      );
      if (fixture.expectDictPrefetch) {
        expect(prefetchLink).not.toBeNull();
      } else {
        expect(prefetchLink).toBeNull();
      }

      // 4. Compute all custom elements and selector behaviors provided by this route's chunks
      const providedTags = new Set<string>();
      for (const chunkFile of chunks) {
        for (const tag of chunkElementMap.get(chunkFile) ?? []) {
          providedTags.add(tag);
        }
      }
      const emittedChunkSet = new Set<V2JsChunkName>(chunks);

      // 5. Check full page + all partial/fragment templates for this route
      const rootsToScan: { label: string; root: ParentNode }[] = [
        { label: "full page", root: doc },
        ...(fixture.partialHtmls ?? []).map((p) => ({
          label: p.label,
          root: parseDocument(p.html),
        })),
      ];

      for (const { label, root } of rootsToScan) {
        for (const tag of collectMorcusTags(root)) {
          if (!providedTags.has(tag)) {
            throw new Error(
              `Route '${
                fixture.name
              }' (${label}) renders <${tag}>, which is not registered by any of the route's scripts [${chunks.join(
                ", "
              )}]`
            );
          }
        }

        for (const [selector, ownerChunk] of selectorChunkMap.entries()) {
          if (hasSelectorMatch(root, selector)) {
            if (!emittedChunkSet.has(ownerChunk)) {
              throw new Error(
                `Route '${
                  fixture.name
                }' (${label}) contains elements matching '${selector}', which requires '${ownerChunk}', but route only emits [${chunks.join(
                  ", "
                )}]`
              );
            }
          }
        }
      }
    }
  });
});
