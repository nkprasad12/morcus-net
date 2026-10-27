import * as path from "path";

/**
 * The contract between the UI V2 bundler (`client.rsbuild.ts`) and the server that
 * serves its output (`web/ui/shell/asset_manifest.server.ts`,
 * `app_router.server.ts`): which chunks exist, how they depend on each other,
 * which logical asset names the manifest maps, and where the build lives.
 *
 * It is the single source of truth for those facts, so it must stay free of
 * `@rsbuild/core` (it is imported into jsdom tests, where `@rsbuild/core`
 * fails to load) and of any `web/ui` module (the bundler must not depend on
 * server or client code; see `eslint.config.mjs`).
 */

export const V2_JS_ENTRY_NAMES = [
  "common",
  "reader",
  "dict",
  "corpus",
  "external",
  "macronizer",
] as const;

export type V2JsEntryName = (typeof V2_JS_ENTRY_NAMES)[number];

export const V2_JS_CHUNKS = [
  "common.js",
  "reader.js",
  "dict.js",
  "corpus.js",
  "external.js",
  "macronizer.js",
] as const;

export type V2JsChunkName = (typeof V2_JS_CHUNKS)[number];

/** Logical asset names written to `manifest.json` and resolved by the server. */
export const V2_ASSET_NAMES = [...V2_JS_CHUNKS, "app.css"] as const;

export type V2AssetName = (typeof V2_ASSET_NAMES)[number];

/** Logical asset name -> content-hashed filename, as in `manifest.json`. */
export type V2AssetManifest = Partial<Record<V2AssetName, string>>;

export interface V2ChunkEntrySpec {
  readonly import: string;
  readonly dependOn?: V2JsEntryName;
  /**
   * Modules that several chunks depending on this one import, bundled as
   * extra entry modules of this chunk so they ship once, here. A plain
   * `import` from the entry file isn't enough: Rspack drops an import of a
   * side-effect-free module whose exports the chunk doesn't use, and then each
   * dependent chunk bundles its own copy. Entry modules are never dropped.
   * `checkV2ChunkDuplication` fails the build when a module needs listing.
   */
  readonly shared?: readonly string[];
}

/**
 * The UI V2 client JS chunk entry points and their `dependOn` hierarchy.
 * Consumed by `client.rsbuild.ts` (`source.entry`) and by
 * `route_bundle_conformance.test.ts`.
 */
export const V2_CHUNK_ENTRIES: Readonly<
  Record<V2JsEntryName, V2ChunkEntrySpec>
> = {
  common: {
    import: "./src/web/ui/shell/common_entry.client.ts",
    shared: [
      // Dictionary URLs: used by the dict and macronizer chunks.
      "./src/web/ui/dict/search/dict_params.common.ts",
      // Embedded-dictionary host wrapper: used by the reader and macronizer chunks.
      "./src/web/ui/dict/search/dict_frame_host.client.ts",
    ],
  },
  dict: {
    import: "./src/web/ui/dict/dict_entry.client.ts",
    dependOn: "common",
  },
  reader: {
    import: "./src/web/ui/reader/reader_entry.client.ts",
    dependOn: "common",
  },
  external: {
    import: "./src/web/ui/external/external_entry.client.ts",
    dependOn: "reader",
  },
  corpus: {
    import: "./src/web/ui/corpus/corpus_entry.client.ts",
    dependOn: "common",
  },
  macronizer: {
    import: "./src/web/ui/macronizer/macronizer_entry.client.ts",
    dependOn: "common",
  },
} as const;

/**
 * Every kind of UI V2 page, by the client code it needs. Reader pages are
 * `library` (they're rendered with `activePage: "library"` and need the same
 * chunk); the External Reader is `external`.
 */
export const V2_ROUTES = [
  "about",
  "dicts",
  "library",
  "corpus",
  "external",
  "macronizer",
] as const;

export type V2Route = (typeof V2_ROUTES)[number];

/**
 * The one chunk each route needs directly. Its `dependOn` ancestors are added
 * by `v2RouteScripts`, so this map never lists them.
 */
const V2_ROUTE_LEAF: Readonly<Record<V2Route, V2JsEntryName>> = {
  about: "common",
  dicts: "dict",
  library: "reader",
  corpus: "corpus",
  external: "external",
  macronizer: "macronizer",
};

/**
 * The chunks a route loads, in the order their `<script type="module">` tags
 * must appear: every `dependOn` ancestor before its dependents, so the chunk
 * runtime in `common.js` is ready before anything that needs it.
 */
export function v2RouteScripts(route: V2Route): V2JsChunkName[] {
  const chain: V2JsChunkName[] = [];
  let cursor: V2JsEntryName | undefined = V2_ROUTE_LEAF[route];
  while (cursor !== undefined) {
    chain.unshift(`${cursor}.js`);
    cursor = V2_CHUNK_ENTRIES[cursor].dependOn;
  }
  return chain;
}

/**
 * Where the UI V2 bundler writes and the server reads assets. Resolved on
 * each call so tests can point `MORCUS_V2_BUILD_DIR` at a temporary
 * directory instead of overwriting the `build/client` a running dev server is
 * serving.
 */
export function getV2BuildDir(): string {
  return path.resolve(
    process.cwd(),
    process.env.MORCUS_V2_BUILD_DIR ?? "build/client"
  );
}

/**
 * Brotli quality for build-time `.br` siblings of fetched assets (`common.js`,
 * `reader.js`, `dict.js`, `corpus.js`, `external.js`, `macronizer.js`,
 * `app.css`), written by `compressOutputs` (`bundler/plugin_utils.ts`),
 * served by `preCompressedMiddleware` (`web/web_server.ts`), and budgeted in
 * `bundler/client_bundle_budget.ts`.
 */
export const STATIC_BROTLI_QUALITY = 11;

/**
 * Brotli quality for on-the-fly `compression()` output (`web/web_server.ts`,
 * mostly SSR HTML, which carries inlined `critical.js` and `critical.css`).
 * `compression()` defaults to 4, where Brotli is no smaller than gzip-6 on our
 * pages; 5 is ~7% smaller for ~1.5x the CPU (well under 1 ms on the landing
 * page, ~4 ms on the largest entry pages). Higher levels gain little more until
 * 10-11, which take 30-100x the CPU and belong at build time, never on the fly.
 */
export const DYNAMIC_BROTLI_QUALITY = 5;

