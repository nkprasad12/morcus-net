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
  - **Per-Slice Audit Check**: While staging each slice, review the files with fresh eyes to strip dead code, leftover transitional shims, or stale comments.
  - **Zero-Drift Verification**: Before merging to `dev`, verify `git diff archive/lit-prototype-raw..HEAD` contains _only_ intentional audit cleanups.

---

## 3. Routing Cutover (Drop `/v2` Dev Prefix & Mount at `/`)

`/v2/*` is only a development-time mount point for side-by-side coexistence and will never be deployed publicly. Cutover consists of dropping the `/v2` prefix so V2 serves directly from `/`:

- [x] **Mount V2 Router at Root (`/`)**:
  - Mount the V2 router at `/` in [`src/web/web_server.ts`](../../web_server.ts) (replacing the V1 SPA catch-all), and strip the `/v2` prefix from internal V2 route helpers, links, and static asset paths (`/v2/assets/*` → `/assets/*` or equivalent).
- [x] **Legacy V1 URL Compatibility**:
  - Where V2 route paths or query parameters differ from deployed V1 URLs (e.g. `/dicts`, `/lat_lib`), add redirects or route aliases so existing external links and user bookmarks continue to work.
- [x] **Update Test Routes**:
  - Update V2 unit, E2E, and visual regression test URLs from `/v2/*` to `/*`.

---

## 4. Decommissioning UI V1

Since the §3 cutover, V1 is unreachable from browsers: `start_server.ts` always mounts the V2 router, so the SPA catch-all in `web_server.ts` never runs. V1 is still built, served from `build/client`, and tested, but nothing uses it. Nothing in V2 imports `src/web/client/`. Only two other files do: `morceus/projects/gui/morceus_helper_root.tsx` (`useApiCall`) and `common/dictionaries/indexdb_backing.ts` (the IndexedDB wrappers).

This work lands on `lit-prototype` **before** the §2 re-slot, which then ends with a single "Delete UI V1" slice. Order: precompression first, then E2E parity, then deletion.

- [x] **Precompressed V2 Assets** (first, before any deletion): done; see §1, "Precompressed Static Assets". `compressOutputs` in `plugin_utils.ts` stays after the V1 bundler deletion because V2 uses it.
- [ ] **Port V1-Only CUJs to V2 E2E** (before the V1 suites are deleted):
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
- [ ] **Delete V1 Client Code**:
  - Move `src/web/client/utils/indexdb/{types,wrappers}.ts` (and the test) to `src/common/indexdb/`. **Keep** `common/dictionaries/indexdb_backing.ts` and `common/bytedata/compression.ts` for a future offline mode, with a header note so dead-code sweeps leave them alone.
  - Replace `useApiCall` in the Morceus helper GUI with a local `fetch` hook.
  - Tag `archive/ui-v1` and point V2 comments and docs that cite V1 paths at it.
  - Remove `src/web/client/` and the V1 Playwright suites: `browser_e2e`, `browser_screenshot` (+24 snapshots) and `bundle_validation`. `client_performance` is skipped until §5 re-targets it.
- [ ] **Retire V1 Bundler & Build Steps**:
  - Remove the V1 client build pipeline from `src/bundler/`, `src/scripts/prod_build_steps.ts`, and `src/scripts/run_morcus.ts`, making the Rsbuild V2 bundle the sole web client build:
    - Delete `morcus-net.rsbuild.ts`, `morcus-net.esbuild.ts` and `rsbuild_plugins.ts`. This removes the V1 `serviceworker` environment, whose output is already shadowed by the `/serviceworker.js` cleanup route.
    - Point `./morcus.sh bundle` at `v2.rsbuild.ts`.
    - Make V2 the default `e2e` target.
  - `web_server.ts`: remove the `/offlineData/:resourceName` route, the `build/client` static mount, the SPA catch-all and the V1 precompression middleware. Make `v2Router` required.
  - Stop generating `build/offlineData` (`packCompressedChunks` in `ls_generate`, `gaf_generate` and `sh_generate`, `web/server/chunking.ts`, `OFFLINE_DATA_DIR`).
- [ ] **Prune V1-Only Server Endpoints**:
  - No V2 client calls the V1 JSON-RPC routes, and nothing outside the UI uses them, so all ten are removed from `start_server.ts`. V2's own `POST /api/report` already shadows V1's.
  - Move the types V2 borrows from `web/api_routes.ts` to their owners, then delete the file: the macronizer types → `src/macronizer/`, `ReportApiRequest` → next to `github.ts`, `CorpusQueryRequest` → `common/library/corpus/`.
  - Delete `addApi`/`RouteDefinition`, `client_rpc.ts`, `logClientEvent`/`ClientEventData`, and the route-only helpers. Keep `ServerExtras`/`RequestData`/`parsing.ts`.
  - Re-target or delete the V1-RPC tools: `load_test.ts`, `benchmark_configs.ts`, `morcus_backend_integration.test.ts`, `rpc_integration.test.ts`.
- [ ] **Dependency & Config Cleanup**:
  - Uninstall V1-only npm packages from `package.json`: `@mui/material`, `@emotion/serialize`, `@testing-library/*` and `@rsbuild/plugin-preact`. Keep `preact`, the React lint plugins and the esbuild HTML plugins for the two Preact dev tools (LS editor, Morceus helper GUI).
  - Simplify `eslint.config.mjs`, `tsconfig.json`, and `jest.config.js` by removing legacy V1 exemptions. Scope the React lint blocks to the two dev-tool directories instead of "everything except `src/web/v2`".
  - Fix the ~7 async-safety violations in `start_server.ts` / `web_server.ts` and extend `@typescript-eslint/no-floating-promises` / `@typescript-eslint/no-misused-promises` beyond `src/web/v2` to cover server entrypoints (or repo-wide once legacy V1 code is deleted).
  - Extend the import-boundary tier lint in `eslint.config.mjs` beyond `src/web/v2` and `src/bundler` (e.g. to `src/start_server.ts`, `src/scripts/**`, and `src/integration/**`) so Node code cannot import `*.client.ts` modules (DOM globals at load time) and browser-bound code cannot import `*.server.ts`.

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
