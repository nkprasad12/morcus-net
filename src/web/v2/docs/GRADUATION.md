# UI V2 Graduation Strategy & Checklist

Forward-looking roadmap for graduating UI V2 from a side-by-side prototype (`/v2/*`) into the primary Morcus Net interface, retiring UI V1, and re-optimizing shared infrastructure around V2's architecture.

> [!NOTE]
> Incremental, day-to-day code quality items inside `src/web/v2/` are tracked separately in [CODE_HEALTH.md](CODE_HEALTH.md). This document captures the milestone tasks required to land V2 on `dev`, cut over production routing, decommission V1, and re-tune build artifacts once V1 no longer exists.

---

## 1. Pre-Cutover Parity & Observability

Before switching default traffic away from V1, verify that non-UI operational behaviors from V1 are accounted for in V2:

- [x] **Telemetry & Usage Logging**:
  - Every routed V2 request writes one row to V1's `ApiCalls` collection, in the same schema, tagged `extras.ui = "v2"`. This covers full pages, partials, the dictionary iframe, `/api/*`, errors and aborted requests. The row format and design decisions are documented in [`core/server/telemetry.server.ts`](../core/server/telemetry.server.ts). `ServerHealth` (memory) was already route-independent. V1's only client event (`ExternalContentOpen`) is now an ordinary `/external` request row, so `/api/logClientEvent` has no V2 counterpart and goes away with V1.
  - **Comparing V1 and V2 numbers across the cutover.** Row counts are not directly comparable:
    - _One SSR request replaces several RPCs._ A V1 dictionary lookup was an SPA load plus `/api/dicts/fused`; in V2 it is one `/dicts` row. Compare `extras.ui = "v2" AND name = "/dicts" AND extras.mode = "page"` against V1's `/api/dicts/fused`. `latencyMs` is measured at the same point in both (hand-off, before compression and flush); for the breakdown use the `extras` marks (`lookupComplete`, dictionary phases, `sent`, `end`).
    - _Completion requests changed granularity, not fidelity._ V1's client fetched each dictionary's whole first-letter bucket once per session and filtered client-side, with no HTTP caching. V2 fetches two-letter chunks with a day-long `max-age` and a client LRU. Counts differ in both directions, and neither version sees full typed prefixes. `/dicts?q=` is the ground truth for lookups in both.
    - _V2 counts are more complete._ V1's offline PWA mode answered lookups inside the service worker, invisible to the server.
    - _V2 also logs aborted requests_ (`extras.aborted`), as V1 did by logging at hand-off. Filter on it when comparing completed-request latency.
    - _Names already drop `/v2`._ V2 rows use route patterns without the mount prefix, so the cutover (§3) does not split V2's own history. No V2 name collides with a V1 RPC path (V2 prefixes non-GET routes with the method, e.g. `POST /api/report` vs V1's `/api/report`).
- [x] **Metadata, SEO & Static Entrypoints**:
  - Canonical URLs (`<link rel="canonical">` and `og:url`), OpenGraph link preview tags (`og:site_name`, `og:title`, `og:type`, `og:image`), and `public/robots.txt` (served at `/robots.txt` to block crawler traffic on `/api/`, `format=partial`, `embedded=1`, translation partials, and external reader imports) are in place. Dynamic `<meta name="description">` and `sitemap.xml` are intentionally skipped (search engines extract snippets directly from the SSR Latin/dictionary text and crawl the catalog and dictionary organically). At cutover (§3), strip the `/v2` prefix from `canonicalPath` values and `public/robots.txt`.
  - PWA installability is already in place and needs no cutover work: V2 pages link the manifest and `theme-color`, the favicon is served at `/favicon.ico`, and `/serviceworker.js` serves a script that removes the retired V1 offline worker and its storage. The manifest (`start_url`, `scope`, `shortcuts`) uses root paths shared by V1 and V2, so mounting V2 at `/` moves installed apps over with no reinstall. Keep `/public`, `/.well-known` (Android TWA `assetlinks.json`), `/favicon.ico`, `/robots.txt`, and `/serviceworker.js` mounted ahead of the V2 router.
- [x] **Build-Versioned Caching for Partials & Fragments**:
  - Background fetches whose response is static per build carry `?v=<build version>` and are served `immutable` at the current version, so repeats never leave the browser (previously each repeat revalidated by ETag, which still cost a full render). User-visible URLs stay unversioned. The build version is stamped on `<html data-version>` by `renderPageShell`; clients use `withBuildVersion(url)` or `swapSlots({ versioned: true })` (`core/nav/build_version.client.ts`), and routes call `setVersionedCacheControl` on the success path only (`core/server/build_version.server.ts`), which trusts only the current version.
  - Versioned today: reader page-turn partials and translations (`private`), `/api/completions` prefix chunks and corpus lemma shards (`public`). Not versioned: `/dicts` partials and suffix completions (both can fall back to cookies), macronizer (POST), full pages.
  - `./morcus.sh web` sets `MORCUS_DEV_SERVER`, which adds a per-process nonce to the version, so a restart after a server-side change never serves markup cached from the previous process. `getCommitId()` stays the plain commit for the about page and issue reports.
- [x] **Build Provenance ID**:
  - Prod builds download dictionary and library inputs from unpinned upstream branch HEADs, so a rebuild of the same commit (e.g. a CI re-run) can change content. The production build version therefore covers the inputs too: `runPipeline` records each download's git blob SHA-1 and each clone's HEAD (`src/scripts/build_provenance.ts`), the last step of `prod_build_steps.ts` writes `build/morcusnet.build.json` (`{ commit, inputs, buildId }`), and `start_server.ts` loads `buildId` into `BUILD_ID` when the file's commit matches `COMMIT_ID`. `getBuildVersion()` prefers it over the commit. Dev builds write no file and keep using the commit plus the per-process nonce.
  - The recorded IDs are the ones GitHub reports (the contents API `sha` for a file, the branch commit for a clone), so the file doubles as a record of exactly which upstream data each deploy shipped. Hashing adds about a second to a prod build.
  - At re-slot time (§2), the pipeline half (`src/scripts/`) belongs with the build infrastructure slice and the `build_version.server.ts` half with core.
- [x] **Precompressed Static Assets**:
  - Every minified V2 build (production and `./morcus.sh web`) writes `.br` (quality 11) and `.gz` (level 9) siblings of each hashed asset in the manifest (`compressOutputs` in `src/bundler/plugin_utils.ts`). `critical.*` is inlined and `manifest.json` is never served, so neither gets siblings. This adds about 0.2 s to the build.
  - The existing `preCompressedMiddleware` in `web_server.ts` was reworked in place to serve V2 instead of V1, mounted on `/assets` ahead of the V2 router. It serves a sibling whenever the client accepts that encoding (honouring `q=0`), preferring brotli over the client's order, since browsers list `gzip` first. Responses carry `Vary: Accept-Encoding`, `immutable, no-transform`, and `X-MorcusNet-PreCompressed: 1`. `compression()` leaves them alone because they already carry a `Content-Encoding`. A missing sibling falls back to on-the-fly gzip. The rework also fixed three bugs in the V1 version: `includes()` ignored `q=0`, `Content-Type` was always JS, and a cached directory listing missed files written after startup. V1 bundles are no longer served precompressed, since V1 is unreachable and about to be deleted.
  - Measured on the current bundle: 302 kB raw, 79 kB on-the-fly gzip, **70 kB brotli** (−11%; the stylesheet −15%).
  - Tests: `web_server.test.ts` covers negotiation, fallback, exclusions, traversal and HEAD. `v2_router.test.ts` checks that a real precompressed build writes siblings that decode to each asset. The "UI V2 bundle validation" E2E checks that every chunk and the stylesheet come back precompressed in br and gzip, identical to the original.

---

## 2. Branch Audit & Clean Merge into `dev`

The `lit-prototype` branch has accumulated 260+ commits across multiple architectural iterations (including introducing and later removing Lit, plus repeated binary snapshot updates). Rather than merging raw history into `dev`, re-slot the branch into a clean, dependency-ordered commit series while auditing each slice:

- [ ] **Archive Raw Prototype History**:
  - Tag the tip of `lit-prototype` (e.g. `git tag archive/lit-prototype-raw`) so the granular prototype commit log remains preserved for historical reference without polluting `git blame` on `dev`.
- [ ] **Stage & Audit by Topological Slice (~10–12 Commits)**:
  - Branch off `dev` and pull in changes bottom-up so every commit compiles (`npx tsc --noEmit`) and passes its unit tests (`npx jest`), keeping the series `git bisect`-safe:
    1. **Shared Non-V2 Fixes & Hardening**: `src/common/smith_and_hall/`, `src/common/text_cleaning*`, `src/web/utils/rpc/parsing*`, `src/web/scraping/`.
    2. **Library V2 Common Pipeline**: `src/common/library/v2/`, `src/scripts/process_lat_lib.ts`.
    3. **Build, Lint & Bundler Infrastructure**: `package.json`, `eslint.config.mjs`, `.stylelintrc.json` together with the custom rules it loads from `src/web/v2/tools/stylelint/`, `src/bundler/v2.rsbuild.ts`, `src/bundler/v2_bundle_budget.ts`, `src/scripts/prod_build_steps.ts`.
    4. **Developer Tooling & Visual Diff Inspector**: `src/scripts/visual_diff/`, `src/scripts/run_morcus.ts`, `src/web/v2/tools/css_audit/`, `src/web/v2/tools/inventory/` (+ `src/web/v2/inventory_ratchet.json`).
    5. **UI V2 Core & Testing Harness**: `src/web/v2/core/`, `src/web/v2/testing/`. If finer commits help, the `core/` subdirectories give a natural inner order: `dom/` + `nav/` + `state/` (not separable: `base_element` imports `nav/router` and `prepaint` imports `state/storage`) → `widgets/` + `server/` → `index.client.ts` barrel + `conformance/` (the conformance tests scan every slice, so they land last with `testing/`).
    6. **UI V2 Shell & Dialogs**: `src/web/v2/shell/`, `src/web/v2/dialog/`.
    7. **UI V2 Dictionary Slice**: `src/web/v2/dict/`. Inner order: `settings/` + `search_bar.common` → `landing/` + `entry/` + `toc/` → rest of `search/` (`dict_search.client` imports from `landing/` and `entry/`) → root routes/page/conformance tests.
    8. **UI V2 Library & Reader Slices**: `src/web/v2/library/`, `src/web/v2/reader/`.
    9. **UI V2 Secondary Slices**: `src/web/v2/corpus/`, `src/web/v2/external/`, `src/web/v2/about/`, `src/web/v2/macronizer/`.
    10. **V2 Entrypoints & Server Integration**: `src/web/v2/v2_*.ts`, `src/web/web_server.ts`, `src/start_server.ts`.
    11. **E2E Suites, Visual Baselines & Docs**: `src/integration/`, `src/web/v2/README.md`, `src/web/v2/docs/`, the slice `README.md` / `TODOS.md` files, `AGENTS.md`.
    12. **Delete UI V1** (last): the §4 `[v1-removal]` commits on `lit-prototype`: `src/web/client/`, the V1 bundler and build steps, the V1 JSON-RPC routes and most of `src/web/utils/rpc/`, offline data generation, V1-only packages, and the repo-wide lint changes. Slices 1–11 should not stage V1-touching hunks; this slice carries them.
  - **Per-Slice Audit Check**: While staging each slice, review the files with fresh eyes to strip dead code, leftover transitional shims, or stale comments.
  - **Zero-Drift Verification**: Before merging to `dev`, verify `git diff archive/lit-prototype-raw..HEAD` contains _only_ intentional audit cleanups.

---

## 3. Routing Cutover (Drop `/v2` Dev Prefix & Mount at `/`)

`/v2/*` is only a development-time mount point for side-by-side coexistence and will never be deployed publicly. Cutover consists of dropping the `/v2` prefix so V2 serves directly from `/`:

- [x] **Mount V2 Router at Root (`/`)**:
  - Mount the V2 router at `/` in [`src/web/web_server.ts`](../../web_server.ts) (replacing the V1 SPA catch-all), and strip the `/v2` prefix from internal V2 route helpers, links, and static asset paths (`/v2/assets/*` → `/assets/*` or equivalent).
- [x] **Legacy V1 URL Compatibility**:
  - Where V2 route paths or query parameters differ from deployed V1 URLs (e.g. `/dicts?q=<id>&o=2`, `/work/<workId>`, `/work/...?id=`), add redirects or route aliases so existing external links and user bookmarks continue to work.
- [x] **Update Test Routes**:
  - Update V2 unit, E2E, and visual regression test URLs from `/v2/*` to `/*`.

---

## 4. Decommissioning UI V1

**Done.** After the §3 cutover V1 was unreachable from browsers, but still built, served from `build/client`, and tested. Nothing in V2 imported `src/web/client/`; only two other files did (`morceus/projects/gui/morceus_helper_root.tsx` and `common/dictionaries/indexdb_backing.ts`). V1 is preserved at the `archive/ui-v1` tag.

This work lands on `lit-prototype` **before** the §2 re-slot, which then ends with a single "Delete UI V1" slice. Order: precompression first, then E2E parity, then deletion.

- [x] **Precompressed V2 Assets** (first, before any deletion): done; see §1, "Precompressed Static Assets". `compressOutputs` in `plugin_utils.ts` stays after the V1 bundler deletion because V2 uses it.
- [x] **Port V1-Only CUJs to V2 E2E** (before the V1 suites are deleted): done in `src/integration/suites/browser_v2_reader.test.ts`, run by `./morcus.sh e2e --v2`; stable across all four projects over 3 repeats. One intended difference from V1: a TOC jump to a line on the current page scrolls in place without updating the URL, as gutter anchors do (V1 rewrote it to `?id=1.2.161`).
  - Dictionary and corpus are well covered in V2. The library and reader have almost no functional browser coverage (only screenshots, late hydration and swipe). Nine tests close the gap:
    - Library: filter, open a work, the reader loads.
    - Reader:
      - saved spot is restored after a Next page turn and after a TOC jump;
      - opening a work without `id` → `replaceState` to `?id=1.1`, and Back returns to the library (with the `?id=1.3` deep link folded in);
      - the line deep link `?id=1.2.161` scrolls the line into view;
      - the TOC jump field works;
      - translations load and follow page turns;
      - clicking a passage word shows its entry;
      - copying across verse lines gives `\n`-separated text (Juvenal, _Saturae_ 1.1).
    - Dictionary: arrow-key autocomplete selection (one run).
  - Intentionally not ported:
    - the whitespace-query test: string cleanup, already in `dict_search.test.ts`;
    - "editor shown on library landing": static SSR markup, covered by `library.test.ts`;
    - legacy dictionary URLs: server redirects, covered by `v2_router.test.ts`;
    - the V1 screenshot suite: covered by V2 visual baselines.
- [x] **Delete V1 Client Code**:
  - Move `src/web/client/utils/indexdb/{types,wrappers}.ts` (and the test) to `src/common/indexdb/`. **Keep** `common/dictionaries/indexdb_backing.ts` and `common/bytedata/compression.ts` for a future offline mode, with a header note so dead-code sweeps leave them alone.
  - Replace `useApiCall` in the Morceus helper GUI with a local `fetch` hook.
  - Tag `archive/ui-v1` and point V2 comments and docs that cite V1 paths at it.
  - Remove `src/web/client/` and the V1 Playwright suites: `browser_e2e`, `browser_screenshot` (+24 snapshots) and `bundle_validation`. `client_performance` stays: it only drives page URLs, which V2 serves; §5 re-targets its metrics.
- [x] **Retire V1 Bundler & Build Steps** (landed with the deletion above, in one commit):
  - Remove the V1 client build pipeline from `src/bundler/`, `src/scripts/prod_build_steps.ts`, and `src/scripts/run_morcus.ts`, making the Rsbuild V2 bundle the sole web client build:
    - Delete `morcus-net.rsbuild.ts`, `morcus-net.esbuild.ts` and `rsbuild_plugins.ts`. This removes the V1 `serviceworker` environment, whose output is already shadowed by the `/serviceworker.js` cleanup route.
    - Point `./morcus.sh bundle` at `v2.rsbuild.ts`.
    - Making V2 the default `e2e` target is left to §5.
  - `web_server.ts`: remove the `/offlineData/:resourceName` route, the `build/client` static mount, the SPA catch-all and the V1 precompression middleware. Make `v2Router` required.
  - Stop generating `build/offlineData` (`packCompressedChunks` in `ls_generate`, `gaf_generate` and `sh_generate`, `web/server/chunking.ts`, `OFFLINE_DATA_DIR`).
- [x] **Prune V1-Only Server Endpoints**:
  - All ten V1 JSON-RPC routes are gone from `start_server.ts`, with `web/api_routes.ts`. Types V2 still uses moved to their owners: macronizer results → `src/macronizer/macronizer_types.ts`, `ReportApiRequest` → `web/utils/github.ts`, `CorpusQueryRequest` → `common/library/corpus/corpus_common.ts`.
  - The RPC framework is reduced to what build artifacts need: `serverMessage` and the `ServerMessage` envelope (library works and corpus suggestion lists are still written in it), `ServerExtras` (dictionary timing hooks), and `parsing.ts`. Deleted: `addApi`/`RouteDefinition`, `client_rpc.ts`, `ApiRoute`, the never-registered `storage_routes.ts` (`object_storage.ts` stays for a possible share-a-pasted-text feature), and `bodyParser.text()` in `web_server.ts`.
  - Deleted route-only helpers: `retrieveWorksList`/`retrieveWorkPreEncoded`, `corpusSuggestions`, `WorkId`/`ListLibraryWorksResponse`, the fused-dictionary wire validators, and `logClientEvent` (the Mongo `ClientEvents` collection gets no more writes; `ApiCalls` rows named after V1 paths stop too).
  - The Morceus helper dev tool now uses a plain Express route and `fetch`.
  - Tools updated for V2: `morcus_backend_integration.test.ts` is now a no-browser smoke test of a built image (PWA and TWA files, dictionary lookups and partials, completions, library, reader, translations, corpus with the Rust bindings, versioned caching, V1 URL redirects, 404); `load_test.ts` drives `/dicts` and `/api/completions`; `measuring_vms.md` measures a dictionary partial.
  - Not covered yet (ideas for V2): a `/settings` redirect for V1 bookmarks (it 404s; V2 settings are dialogs), a health-check endpoint for deploys, and macronizer/report smoke checks that depend on the image's engine and GitHub configuration.
- [x] **Dependency & Config Cleanup**:
  - Uninstalled the V1-only packages: `@mui/material`, `@emotion/serialize`, `@testing-library/{jest-dom,react,user-event}` and `@rsbuild/plugin-preact`. `preact`, the React lint plugins and the esbuild HTML plugins stay for the two Preact dev tools (LS editor, Morceus helper GUI); `body-parser` stays for the LS editor.
  - `eslint.config.mjs`: the React rules apply only to those two tools (`PREACT_DEV_TOOLS`), with the React version pinned since `react` is a Preact alias.
  - `no-floating-promises` / `no-misused-promises` now apply repo-wide. Fixing the 55 violations outside UI V2 found two real bugs: the server's periodic telemetry write and its teardown could reject unhandled (which exits Node), and an L&S test never awaited its assertions. The rest mark deliberate fire-and-forget calls (script entry points, benchmarks) with `void`.
  - The tier lint now covers all non-V2, non-bundler code under `src/` (servers, build steps, scripts, Playwright suites): it can't import `*.client.ts`. Tests are exempt, as in UI V2.
  - `tsconfig.json`: dropped Lit's `experimentalDecorators` (no decorators remain). `useDefineForClassFields: false` stays; flipping it changes class-field semantics across tsc, SWC and Rsbuild and needs its own check. `jest.config.js` is unchanged: the TSX left is the dev tools', which Jest never loads.
- [x] **Docs**:
  - `ARCHITECTURE.md` now describes the UI V2 server, routes and client (the V1 SPA, RPC route manifest and `CACHING_SETTER` conventions are gone); `README.md`, `.github/copilot-instructions.md`, `AGENTS.md` and `TESTING.md` drop V1 references and flags.
  - New `CODE_HEALTH.md` items: move the External Reader store onto `src/common/indexdb/` wrappers, and stop Rsbuild copying `public/` into `build/v2/`.

---

## 5. Test Suite & Performance Benchmark Migration

- [ ] **Make V2 the Default Integration Target**:
  - The V1 Playwright suites are deleted in §4, after their CUJs are ported. What remains: update `npm run integration-tests` and the CI integration job so the V2 functional and visual suites are the default target.
- [ ] **Update Performance Benchmarks**:
  - Re-target performance test suites to measure V2 endpoints (SSR full-page render latency, `?format=partial` fragment latency, memory footprint under load, and client bundle/hydration metrics) rather than legacy V1 SPA/RPC flows.

---

## 6. Re-Tuning Pre-Built Artifacts for V2

During V2 development, V2 deliberately consumed the exact same pre-built dictionary, inflection, and library artifacts (`./morcus.sh build`) as V1 to avoid destabilizing V1 or changing offline build pipelines simultaneously. Those artifacts were shaped over years around V1's architecture and data-transfer model.

Once V1 is removed, audit and re-tune the offline artifact formats specifically around what V2 needs:

- [ ] **Dictionary & Entry Artifacts**:
  - V1 artifacts were structured around V1's RPC payload and client-side rendering expectations.
  - Evaluate whether dictionary databases/artifacts (L&S, Gaffiot, Georges, Smith & Hall, Gesner, Pozo, etc.) can pre-compute or store data closer to V2's SSR/partial rendering and outline extraction needs—reducing per-request XML/string parsing overhead on the server.
- [ ] **Inflection & Search Index Artifacts**:
  - Review inflection lookup tables and autocomplete/search indices to ensure their schema and in-memory/SQLite representations match V2's query patterns and active-dictionary filtering without V1 compatibility shims.
- [ ] **Library & Work Artifacts**:
  - Consolidate `src/common/library/` and `src/scripts/process_lat_lib.ts` so the build pipeline emits only the V2 library/corpus formats, tuning pagination, TOC metadata, and parallel-reader alignment structures directly for V2's reader slice.
