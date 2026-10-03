# UI V2 Graduation Strategy & Checklist

Forward-looking roadmap for graduating UI V2 from a side-by-side prototype (`/v2/*`) into the primary Morcus Net interface, retiring UI V1, and re-optimizing shared infrastructure around V2's architecture.

> [!NOTE]
> Incremental, day-to-day code quality items inside `src/web/v2/` are tracked separately in [CODE_HEALTH.md](CODE_HEALTH.md). This document captures the milestone tasks required to land V2 on `dev`, cut over production routing, decommission V1, and re-tune build artifacts once V1 no longer exists.

---

## 1. Pre-Cutover Parity & Observability

Before switching default traffic away from V1, verify that non-UI operational behaviors from V1 are accounted for in V2:

- [ ] **Telemetry & Usage Logging**:
  - V1 recorded telemetry across its RPC endpoints and client flows that V2 does not yet emit.
  - Audit V1's server and client telemetry hooks (traffic counters, dictionary/reader query metrics, latency/memory reporting, error logging) and wire equivalent instrumentation into V2's Express routes (covering both full SSR navigations and `?format=partial` / autocomplete requests).
- [ ] **Metadata, SEO & Static Entrypoints**:
  - Verify canonical URLs, `<meta>` descriptions, OpenGraph tags, `robots.txt` / sitemaps, and PWA/manifest/favicon assets when served from `/` instead of `/v2`.
- [ ] **Build-Versioned Caching for Partials & Fragments**:
  - Today repeated partial fetches revalidate by ETag, which Express computes from the rendered body, so every repeat costs a full server render. Content is static per build, so a background fetch carrying `?v=<commit>` can be served `immutable` and never leave the browser on repeats. Keep user-visible URLs unversioned (only the `fetch` URL carries `v`).
  - Stamp the build version once on `<html data-version>` in `renderPageShell`, add a client `withBuildVersion(url)` helper, and replace corpus's bespoke `data-lemmata-version`. Version explicitly at call sites (or via a `swapSlots` option), not implicitly inside `swapSlots`: POST must be excluded and `fallback(url)` must get the unversioned URL.
  - Server side, use `setVersionedCacheControl` (`core/build_version.server.ts`), which only trusts the current build's version. Keep `Vary: X-Requested-With` on dual-mode routes.
  - First pass: reader page-turn partials and translations (highest repeat rate), plus `/v2/api/completions` prefix and suffix chunks. Use `private` for HTML partials.
  - Exclude `/v2/dicts` partials at first: they fall back to cookies when `d`/`o` are absent, and `canSave` changes rendered links, so a `public` cache could serve one user's view to another. Revisit only with a guard (and a test) that the response doesn't depend on cookies.
  - Not cacheable: macronizer (POST body). V1's `CACHING_SETTER` (0.1 year, deliberate) goes away with V1.

---

## 2. Branch Audit & Clean Merge into `dev`

The `lit-prototype` branch has accumulated 260+ commits across multiple architectural iterations (including introducing and later removing Lit, plus repeated binary snapshot updates). Rather than merging raw history into `dev`, re-slot the branch into a clean, dependency-ordered commit series while auditing each slice:

- [ ] **Archive Raw Prototype History**:
  - Tag the tip of `lit-prototype` (e.g. `git tag archive/lit-prototype-raw`) so the granular prototype commit log remains preserved for historical reference without polluting `git blame` on `dev`.
- [ ] **Stage & Audit by Topological Slice (~10–12 Commits)**:
  - Branch off `dev` and pull in changes bottom-up so every commit compiles (`npx tsc --noEmit`) and passes its unit tests (`npx jest`), keeping the series `git bisect`-safe:
    1. **Shared Non-V2 Fixes & Hardening**: `src/common/smith_and_hall/`, `src/common/text_cleaning*`, `src/web/utils/rpc/parsing*`, `src/web/scraping/`.
    2. **Library V2 Common Pipeline**: `src/common/library/v2/`, `src/scripts/process_lat_lib.ts`.
    3. **Build, Lint & Bundler Infrastructure**: `package.json`, `eslint.config.mjs`, `.stylelintrc.json`, `src/bundler/v2.rsbuild.ts`, `src/bundler/v2_bundle_budget.ts`, `src/scripts/prod_build_steps.ts`.
    4. **Developer Tooling & Visual Diff Inspector**: `src/scripts/visual_diff/`, `src/scripts/run_morcus.ts`.
    5. **UI V2 Core & Testing Harness**: `src/web/v2/core/`, `src/web/v2/testing/`.
    6. **UI V2 Shell & Dialogs**: `src/web/v2/shell/`, `src/web/v2/dialog/`.
    7. **UI V2 Dictionary Slice**: `src/web/v2/dict/`.
    8. **UI V2 Library & Reader Slices**: `src/web/v2/library/`, `src/web/v2/reader/`.
    9. **UI V2 Secondary Slices**: `src/web/v2/corpus/`, `src/web/v2/tools/`, `src/web/v2/external/`, `src/web/v2/about/`.
    10. **V2 Entrypoints & Server Integration**: `src/web/v2/v2_*.ts`, `src/web/web_server.ts`, `src/start_server.ts`.
    11. **E2E Suites, Visual Baselines & Docs**: `src/integration/`, `src/web/v2/README.md`, `src/web/v2/docs/`, the slice `README.md` / `TODOS.md` files, `AGENTS.md`.
  - **Per-Slice Audit Check**: While staging each slice, review the files with fresh eyes to strip dead code, leftover transitional shims, or stale comments.
  - **Zero-Drift Verification**: Before merging to `dev`, verify `git diff archive/lit-prototype-raw..HEAD` contains _only_ intentional audit cleanups.

---

## 3. Routing Cutover (Drop `/v2` Dev Prefix & Mount at `/`)

`/v2/*` is only a development-time mount point for side-by-side coexistence and will never be deployed publicly. Cutover consists of dropping the `/v2` prefix so V2 serves directly from `/`:

- [ ] **Mount V2 Router at Root (`/`)**:
  - Mount the V2 router at `/` in [`src/web/web_server.ts`](../../web_server.ts) (replacing the V1 SPA catch-all), and strip the `/v2` prefix from internal V2 route helpers, links, and static asset paths (`/v2/assets/*` → `/assets/*` or equivalent).
- [ ] **Legacy V1 URL Compatibility**:
  - Where V2 route paths or query parameters differ from deployed V1 URLs (e.g. `/dicts`, `/lat_lib`), add redirects or route aliases so existing external links and user bookmarks continue to work.
- [ ] **Update Test Routes**:
  - Update V2 unit, E2E, and visual regression test URLs from `/v2/*` to `/*`.

---

## 4. Decommissioning UI V1

Once V2 is serving root traffic and no fallback to V1 is needed:

- [ ] **Delete V1 Client Code**:
  - Remove `src/web/client/` (legacy SPA pages, components, routing, and V1 stylesheets/assets).
- [ ] **Retire V1 Bundler & Build Steps**:
  - Remove the V1 client build pipeline from `src/bundler/`, `src/scripts/prod_build_steps.ts`, and `src/scripts/run_morcus.ts`, making the Rsbuild V2 bundle the sole web client build.
- [ ] **Prune V1-Only Server Endpoints**:
  - Remove legacy JSON-RPC routes and server handlers in `src/web/` that existed solely for the V1 SPA, keeping only shared APIs or endpoints still consumed by V2.
- [ ] **Dependency & Config Cleanup**:
  - Uninstall V1-only npm packages (legacy UI framework/component dependencies, unused bundler plugins) from `package.json`.
  - Simplify `eslint.config.mjs`, `tsconfig.json`, and `jest.config.js` by removing legacy V1 exemptions and `.tsx` client overrides.
  - Fix the ~7 async-safety violations in `start_server.ts` / `web_server.ts` and extend `@typescript-eslint/no-floating-promises` / `@typescript-eslint/no-misused-promises` beyond `src/web/v2` to cover server entrypoints (or repo-wide once legacy V1 code is deleted).
  - Extend the import-boundary tier lint in `eslint.config.mjs` beyond `src/web/v2` and `src/bundler` (e.g. to `src/start_server.ts`, `src/scripts/**`, and `src/integration/**`) so Node code cannot import `*.client.ts` modules (DOM globals at load time) and browser-bound code cannot import `*.server.ts`.

---

## 5. Test Suite & Performance Benchmark Migration

- [ ] **Retire V1 Integration Suites**:
  - Remove legacy V1 Playwright test files and update `npm run integration-tests` / `./morcus.sh e2e` so V2 functional and visual suites are the default integration target.
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
