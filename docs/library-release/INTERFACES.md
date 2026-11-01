# Library Release — Shared Interfaces & Cell Ownership Contract

This document is the binding interface and file-ownership contract for Phases 2 and 3 of the `library-release` swarm (**C1** through **C8**). All shared TypeScript interfaces and per-slice SSR fixture stubs are defined and compile-checked on `lr/architect` (merged into `library-release` before Phase 2 starts).

---

## 1. File Ownership Matrix (Zero-Collision Invariant)

No two cells executing in the same phase may edit the same file, except `upstream_sources.lock.json` where C1 and C5 use strictly disjoint insertion points separated by 7 unchanged lines (§1.1).

| Cell   | Roster Name | Branch            | Phase | Owned Files (Create / Edit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Must NOT Touch                                                                                                                                                                                                                                                                                     |
| :----- | :---------- | :---------------- | :---: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | `architect` | `lr/architect`    |   1   | `docs/library-release/{INTERFACES,PLANS,TIERS,DECISIONS}.md`<br>`src/common/thelatinlibrary/{snapshot_types,page_layer_types}.ts`<br>`src/common/open_texts/catalog_types.ts` + `.test.ts`<br>`src/web/ui/shell/texts_tabs.common.ts`<br>`src/web/ui/open_texts/open_texts_contract.common.ts`<br>`src/web/ui/open_texts/{open_texts_catalog_fixtures,open_texts_reader_fixtures}.ts`<br>`src/web/ui/testing/ssr_fixtures.ts` (wires the two stub builders)<br>`src/common/library/{library_types,process_thelatinlibrary}.ts` (types)<br>`src/common/library/preprocess/preprocessed_types.ts` (types)                                                                                                                                                                                    | All implementation files owned by C1–C8                                                                                                                                                                                                                                                            |
| **C1** | `scraper`   | `lr/c1-scraper`   |   2   | `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary/` (`raw/`, `manifest.json`, `work_index.json`)<br>`src/scripts/thelatinlibrary/crawl/**`<br>`upstream_sources.lock.json` (append `thelatinlibrary` after `gaffiot` only; §1.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/scripts/thelatinlibrary/*.ts` (top-level files owned by C7), `src/common/**`, `src/web/**`                                                                                                                                                                                                    |
| **C2** | `pagelayer` | `lr/c2-pagelayer` |   2   | `src/common/thelatinlibrary/{dom_adapter,page_layer,markers,encoding,index}.ts`<br>`src/common/thelatinlibrary/*.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/common/thelatinlibrary/{snapshot_types,page_layer_types}.ts` (except re-exports), `src/scripts/**`, `src/web/**`                                                                                                                                                                              |
| **C3** | `lawstyle`  | `lr/c3-lawstyle`  |   2   | `src/common/library/section_labels.ts` + `.test.ts`<br>`src/common/library/preprocess/work_preprocessor.ts` + `.test.ts`<br>`src/web/ui/reader/{reader_loader,reader_toc,reader_types}.server.ts` + tests<br>`src/web/ui/reader/reader_toc.client.ts`<br>`src/web/ui/reader/reader_text.css` (`.reader-editorial-smallcaps`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/common/library/process_thelatinlibrary.ts` (owned by C7), `src/web/ui/shell/**`, `src/web/ui/library/**`, `src/web/ui/external/**`, `src/web/ui/open_texts/**`, `src/web/ui/testing/ssr_fixtures.ts`                                                                                          |
| **C4** | `tabs`      | `lr/c4-tabs`      |   2   | `src/web/ui/shell/page_shell.server.ts` + `.test.ts`<br>`src/web/ui/shell/texts_tabs.server.ts` + `.test.ts`<br>`src/web/ui/library/{library.server.ts,library.css}` + tests<br>`src/web/ui/external/{external.server.ts,external_routes.server.ts,external.css}` + tests<br>`src/web/ui/static_pages_seed.server.ts` + `.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `src/web/ui/app_router.server.ts`, `src/web/ui/app.css`, `src/web/ui/open_texts/**`, `src/web/ui/reader/**`, `src/web/ui/testing/ssr_fixtures.ts`                                                                                                                                                  |
| **C5** | `catalog`   | `lr/c5-catalog`   |   2   | `src/common/open_texts/{catalog_builder,catalog_loader}.ts` + tests<br>`src/scripts/build_open_texts_catalog.ts`<br>`src/scripts/{run_morcus,prod_build_steps}.ts`<br>`src/web/ui/open_texts/{open_texts.server.ts,open_texts_routes.server.ts,open_texts.css}` + `.server.test.ts`<br>`src/web/ui/open_texts/open_texts_catalog_fixtures.ts`<br>`src/web/ui/app_router.server.ts` (mount `createOpenTextsRoutes`)<br>`src/web/ui/app.css` (add `@import "./open_texts/open_texts.css";`)<br>`src/web/ui/core/conformance/route_bundle_conformance.test.ts` (`/opentexts` catalog route only; defer `/opentexts?open=...` to C8 after C6 registers `<morcus-open-text-reader>`)<br>`upstream_sources.lock.json` (insert `patrologia_latina-dev` after `phi-public-domain-json` only; §1.1) | `src/web/ui/open_texts/*.client.ts`, `src/web/ui/open_texts/open_texts_reader_fixtures.ts`, `src/web/ui/testing/ssr_fixtures.ts`, `src/web/ui/shell/**`, `src/web/ui/library/**`, `src/web/ui/external/**`                                                                                         |
| **C6** | `otreader`  | `lr/c6-otreader`  |   2   | `src/web/ui/open_texts/{open_text_reader.client.ts,open_text_storage.client.ts,open_text_view_adapter.client.ts}` + `.client.test.ts`<br>`src/web/ui/open_texts/open_texts_reader_fixtures.ts`<br>`src/web/ui/external/external_entry.client.ts` (add `import "@/web/ui/open_texts/open_text_reader.client";`)<br>`src/bundler/client_bundle_budget.ts`<br>`src/web/ui/README.md` (document M4 JS-only exception)                                                                                                                                                                                                                                                                                                                                                                          | `src/web/ui/open_texts/*.server.ts`, `src/web/ui/open_texts/open_texts.css`, `src/web/ui/open_texts/open_texts_catalog_fixtures.ts`, `src/web/ui/testing/ssr_fixtures.ts`, `src/web/ui/core/conformance/route_bundle_conformance.test.ts`, `src/web/ui/app_router.server.ts`, `src/web/ui/app.css` |
| **C7** | `porter`    | `lr/c7-porter`    |   3   | `src/scripts/thelatinlibrary/{html,page,onboard,bracketed_chapters,checks,declamation,digest,gaius,justin,strict_markers}.ts` + tests<br>`src/common/library/process_thelatinlibrary.ts` + `.test.ts`<br>`src/web/ui/reader/reader_dialogs.server.ts` + `.test.ts`<br>`/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary/{works/*.json,manifest.json}`<br>`upstream_sources.lock.json` (re-pin `thelatinlibrary` after regenerating `works/*.json`)                                                                                                                                                                                                                                                                                                                    | `src/scripts/thelatinlibrary/crawl/**`, `src/common/thelatinlibrary/**`, `src/common/open_texts/**`                                                                                                                                                                                                |
| **C8** | `lladapter` | `lr/c8-lladapter` |   3   | `src/common/open_texts/{latin_library_adapter,latin_library_catalog}.ts` + tests<br>`src/common/open_texts/catalog_builder.ts`<br>`src/scripts/prod_build_steps.ts` (if `thelatinlibrary` repoInfo added to catalog step)<br>`src/web/ui/open_texts/open_text_reader.client.ts`<br>`src/bundler/client_bundle_budget.ts`<br>`src/web/ui/core/conformance/route_bundle_conformance.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                 | `src/common/thelatinlibrary/**`, `src/scripts/thelatinlibrary/**`, `upstream_sources.lock.json`                                                                                                                                                                                                    |

### 1.1 Disjoint Rules for Shared Files

1. **`src/web/ui/testing/ssr_fixtures.ts` (Pre-wired in P1)**:
   - `ssr_fixtures.ts` already calls `buildOpenTextsCatalogFixtures()` (from `src/web/ui/open_texts/open_texts_catalog_fixtures.ts`, owned by **C5**) and `buildOpenTextsReaderFixtures()` (from `src/web/ui/open_texts/open_texts_reader_fixtures.ts`, owned by **C6**).
   - **No Phase 2 or Phase 3 cell may edit `src/web/ui/testing/ssr_fixtures.ts`**. C3 and C4's changes to existing reader/library/external renderers flow automatically through the existing `buildLibraryFixtures()`, `buildReaderFixtures()`, and `buildExternalFixtures()` calls in `ssr_fixtures.ts`.
2. **`upstream_sources.lock.json` (Disjoint Hunks in Phase 2; C7 in Phase 3)**:
   - All repository URLs in `upstream_sources.lock.json` **must use `https://github.com/nkprasad12/<repo>.git`** (matching every existing entry in the lock file; SSH `git@github.com:...` is used only for `git push` remotes in the local data clones).
   - In Phase 2, **C5 (`catalog`)** inserts `"patrologia_latina-dev"` immediately after `"phi-public-domain-json"` (before `"gaffiot"`).
   - In Phase 2, **C1 (`scraper`)** appends `"thelatinlibrary"` at the end of `"sources"`, immediately after `"gaffiot"`.
   - In Phase 3 (after C1 and C5 are merged), **C7 (`porter`)** owns `upstream_sources.lock.json` to re-pin `"thelatinlibrary"` after regenerating `works/*.json`.
3. **`src/web/ui/testing/all_entries.client.ts`, `src/web/ui/inventory_ratchet.json`, `src/web/ui/testing/created_dom_allowlist.ts`**:
   - `all_entries.client.ts` already imports `@/web/ui/external/external_entry.client`, so when C6 adds `import "@/web/ui/open_texts/open_text_reader.client";` to `external_entry.client.ts`, `all_entries.client.ts` needs **no edit**.
   - Cells must not edit `inventory_ratchet.json` or `created_dom_allowlist.ts` (write DOM updates through `setHtml` / `replaceWithHtml` from `@/web/ui/core/dom/dom.client` and avoid $\ge 3$-declaration duplicate CSS blocks across files).

---

## 2. Shared Interface Contracts

### 2.1 Contract 1: Snapshot Format & Identity Map (`C1`, `C2`, `C7`, `C8`)

Defined in [`src/common/thelatinlibrary/snapshot_types.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/thelatinlibrary/snapshot_types.ts).

1. **Raw HTML & Sidecar Metadata (`$THELATINLIBRARY_ROOT/raw/`)**:
   - Every crawled page from `https://www.thelatinlibrary.com/<path>` is saved verbatim (raw bytes without UTF-8 re-encoding) at `$THELATINLIBRARY_ROOT/raw/<path>` (e.g. `raw/resgestae.html`, `raw/justin/1.html`).
   - Every raw HTML file has a sidecar `$THELATINLIBRARY_ROOT/raw/<path>.meta.json` satisfying `RawPageMeta` (`url`, `retrieved`, `sha256` all required; C1 backfills `sha256` on the existing pilot `.meta.json` files).
2. **Consolidated Manifest (`$THELATINLIBRARY_ROOT/manifest.json`)**:
   - Keyed by relative path under `raw/` (e.g. `"resgestae.html"`, `"justin/1.html"`), satisfying `SnapshotManifest` (`Record<string, SnapshotPageEntry>`).
   - Backward-compatible with the pilot's `ManifestEntry` (`url`, `retrieved`, `sha256`, `provenance: "noStatement" | "statementFound"`, `provenanceStatements: string[]`, `checks?: string[]`), plus `provenanceClassification` (`"none" | "pre1930" | "post1930_or_copyright"`), `authorPage`, `workId`, `statedEdition`, `excluded`, and `exclusionReason`.
3. **Work Index & Library Identity Map (`$THELATINLIBRARY_ROOT/work_index.json`)**:
   - Satisfies `SnapshotWorkIndex` (`version: 1`, `generatedAt`, `sourceCommit`, `works: SnapshotWorkEntry[]`):
     - `status: "in_library"`: Already in the curated Morcus Library (Perseus, Hypotactic, PHI, or a promoted work in `$THELATINLIBRARY_ROOT/works/*.json`). Omitted from Open Texts so nothing is listed in both tiers (**Strategy Position 1**).
     - `status: "partial"`: Covered only partially by the Morcus Library. Listed in Open Texts with a required `partialCoverage: PartialCoverageInfo` pointing to the Library for the covered part (**Decision #19**).
     - `status: "excluded"`: Post-1930 edition/translation or copyright/permission statement. Excluded from both tiers (**Decision #20**).
     - `status: "candidate"`: Every remaining Latin Library work not in the Library and not excluded, medieval and Neo-Latin included (**Decision #18**).

---

### 2.2 Contract 2: Browser-Safe Page Layer, Encoding & DOM Abstraction (`C2`, `C7`, `C8`)

Defined in [`src/common/thelatinlibrary/page_layer_types.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/thelatinlibrary/page_layer_types.ts).

1. **Zero Node-Only Dependencies in Browser Bundle**:
   - `src/common/thelatinlibrary/` is imported by browser code (`C8` / `C6`) and Node scripts (`C7`).
   - Non-test files in `src/common/thelatinlibrary/` **must not** import `fs`, `path`, `crypto`, or `parse5`.
   - **Browser-Safety Test Requirement**: Because files in `src/common/thelatinlibrary/` do not carry the `.common.ts` suffix, **C2 (`pagelayer`) must include a unit test** that reads all non-test `.ts` files in `src/common/thelatinlibrary/` and asserts zero imports of `fs`, `path`, `crypto`, `node:*`, or `parse5`.
   - `MinimalElementNode` and `MinimalTextNode` are structurally identical to `parse5`'s AST nodes, so `parse5.parse(html)` in Node satisfies `MinimalElementNode` directly with zero wrapper allocation, while C2's `dom_adapter.ts` adapts `new DOMParser().parseFromString(html, "text/html")` in the browser.
2. **Character Encoding Helper (`decodeLatinLibraryHtmlBytes`)**:
   - Some Latin Library HTML files (e.g. `raw/gaius1.html`) are encoded in `ISO-8859-1` / `windows-1252` rather than UTF-8. Because `raw.githubusercontent.com` serves `text/plain; charset=utf-8`, calling `response.text()` in the browser would replace Latin-1 bytes with `U+FFFD`.
   - C2 exports `decodeLatinLibraryHtmlBytes(bytes: ArrayBuffer | Uint8Array): string` from `src/common/thelatinlibrary/index.ts`:
     - Sniff `<meta ... charset=...>` in the first 1,024 ASCII bytes; if `iso-8859-1` or `windows-1252` is declared, decode with `new TextDecoder("windows-1252")`.
     - Otherwise try `new TextDecoder("utf-8", { fatal: true }).decode(bytes)` and fall back to `new TextDecoder("windows-1252").decode(bytes)` if invalid UTF-8 byte sequences are present.
3. **Required Exports from `src/common/thelatinlibrary/index.ts` (owned by C2)**:

   ```ts
   export * from "@/common/thelatinlibrary/page_layer_types";
   export * from "@/common/thelatinlibrary/snapshot_types";

   export function decodeLatinLibraryHtmlBytes(
     bytes: ArrayBuffer | Uint8Array
   ): string;
   export function parseHtmlToMinimalBody(
     rawHtml: string,
     parser?: HtmlBodyParser
   ): { body: MinimalElementNode; headTitle?: string };
   export function isElement(
     node: MinimalChildNode
   ): node is MinimalElementNode;
   export function getAttr(
     el: MinimalElementNode,
     name: string
   ): string | undefined;
   export function hasClass(el: MinimalElementNode, cls: string): boolean;
   export function findElements(
     root: MinimalElementNode,
     pred: (el: MinimalElementNode) => boolean
   ): MinimalElementNode[];
   export function extractText(
     node: MinimalChildNode,
     options?: { preserveLineBreaks?: boolean }
   ): string;
   export function extractLenientPage(
     rawHtml: string,
     options?: LenientPageParseOptions
   ): LenientPageContent;
   export function detectBlockMarkers(
     element: MinimalElementNode,
     text: string,
     kind: PageBlockKind
   ): { markers: DetectedMarker[]; anchors: string[] };
   ```

---

### 2.3 Contract 3: Open Texts Catalog Entry & Bundle Schema (`C5`, `C6`, `C8`)

Defined in [`src/common/open_texts/catalog_types.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/open_texts/catalog_types.ts).

1. **Catalog JSON Bundle (`build/open_texts/open_texts_catalog.json`)**:
   - Built by C5 (`src/common/open_texts/catalog_builder.ts` + CLI `src/scripts/build_open_texts_catalog.ts`, wired into `./morcus.sh build` in `src/scripts/run_morcus.ts` and `src/scripts/prod_build_steps.ts`, with a small fallback seed in `catalog_loader.ts` so unit/conformance tests pass even when `build/open_texts/open_texts_catalog.json` hasn't been built on disk).
   - Satisfies `OpenTextCatalogBundle` (`version: 1`, `generatedAt`, `sources`, `entries`).
2. **Entry Conventions**:
   - Patrologia Latina entries: `id: "pl/<workSlug>"` (e.g. `"pl/stoa0022.stoa002.opp-lat1"`), `source: "patrologia_latina"`, `format: "tei"` (parsed via `parseTeiDocument`), `files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"]`.
   - The Latin Library entries (added by C8): `id: "ll/<workSlug>"`, `source: "thelatinlibrary"`, `format: "thelatinlibrary_html"` (parsed via `parseLatinLibraryOpenText`), `files: ["raw/<page>.html", ...]`.
   - Partial-coverage entries (`status === "partial"`, **Decision #19**): include `partialCoverage: OpenTextPartialNotice` with `libraryWorkId`, `libraryUrl`, `libraryAuthor`, `libraryTitle`, and `message`.

---

### 2.4 Contract 4: Unified Texts Tab Container & Open Texts SSR/Client Contract (`C4`, `C5`, `C6`)

Defined in:

- [`src/web/ui/shell/texts_tabs.common.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/web/ui/shell/texts_tabs.common.ts)
- [`src/web/ui/open_texts/open_texts_contract.common.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/web/ui/open_texts/open_texts_contract.common.ts)

1. **Top Bar & Active Page Highlighting (Decision #13)**:
   - `V2ActivePage` in `src/web/ui/shell/page_shell.server.ts` keeps `"library"` while changing the visible top-bar link label from `Library` to **`Texts`** (`href="/library"`).
   - `/library`, `/work/...`, `/opentexts`, and `/externalReader` all pass `activePage: "library"` to `renderPageShell`.
2. **Three-Tab Header Component (`src/web/ui/shell/texts_tabs.server.ts`, owned by C4; Decisions #14, #15, #16)**:
   - C4 exports `renderTextsTabBar(activeTab: TextsTabId, options?: TextsTabBarOptions): SafeHtml` from `src/web/ui/shell/texts_tabs.server.ts`, styled in `src/web/ui/library/library.css` per [`read_section_mockup.html`](file:///usr/local/google/home/nkprasad/.gemini/jetski/brain/32850f0c-4f1e-4e2a-ba66-ebfff5e45562/read_section_mockup.html):
     - Renders the three tabs in order: **Library** (`/library`) · **Open Texts** (`/opentexts`, including the subtle uncurated indicator dot `<span class="texts-tab-dot" aria-hidden="true"></span>` per the mockup) · **Your texts** (`/externalReader`), with desktop labels (`Library`, `Open Texts`, `Your texts`), mobile short labels (`Library`, `Open`, `Mine`), and `aria-current="page"` on the active tab.
   - Rendered on `/library` (by C4), `/opentexts` catalog view (by C5), and `/externalReader` landing view (by C4).
3. **Open Texts Catalog Listing on `/opentexts` (owned by C5; Decisions #16, #17, #19)**:
   - Rendered when `req.query.open` is absent.
   - Includes the **"Uncurated"** explainer notice banner at the top of the Open Texts tab (matching `read_section_mockup.html`), a search + filter bar (`q`, `source`: `All | Patrologia Latina | The Latin Library`, `period`: `All | Classical | Late Antique | Patristic | Medieval | Neo-Latin`), and an **Author $\rightarrow$ Works** grouped list (matching `/library` and `read_section_mockup.html`) where each work row shows its title link (`/opentexts?open=<id>`), **source badge** (`Patrologia Latina` / `The Latin Library`), volume/period label, and any `partialCoverage` note + Library link (Decision #19).
   - Emits `scripts: ["common.js", "reader.js"]`.
4. **Open Texts Client-Side Reader on `/opentexts?open=<id>` (C5 server host + C6 client reader; M4 & Decision #16)**:
   - When `req.query.open` matches an `OpenTextCatalogEntry.id`, C5 renders `renderOpenTextReaderHostHtml({ entry, sourceMeta, initialSection: req.query.page ?? req.query.section, backHref: "/opentexts" })` inside `renderPageShell({ ..., activePage: "library", isReader: true, widthSurface: "library", scripts: ["common.js", "reader.js", "external.js"] })`.
   - **C6 (`otreader`)** implements `<morcus-open-text-reader>` in `src/web/ui/open_texts/open_text_reader.client.ts` (imported in `src/web/ui/external/external_entry.client.ts`):
     1. In synchronous `onConnect()`, reads `[data-role="open-text-payload"]`, `[data-role="open-text-loading"]`, `[data-role="open-text-error"]`, `[data-role="open-text-error-message"]`, `[data-role="open-text-retry"]`, and `[data-role="open-text-mount"]` (`OPEN_TEXT_READER_ROLES`), wires the `retry` button, and starts async loading.
     2. Checks IndexedDB (`open_text_storage.client.ts`, keyed by `(entry.id, sourceMeta.commit)`) for a cached `OpenTextDocument`.
     3. On cache miss, fetches `entry.files` from `buildOpenTextFileUrls(sourceMeta, path).primaryUrl` (falling back to `.fallbackUrl`), parses into an `OpenTextDocument` (`{ title, author, urn, pagination, pages: OpenTextPage[], warnings }` from [`src/common/open_texts/open_text_document.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/open_texts/open_text_document.ts)):
        - For `entry.format === "tei"`: decodes UTF-8 text and calls `parseTeiDocument(xml)` (`src/common/open_texts/tei_parser.ts`).
        - For `entry.format === "thelatinlibrary_html"`: reads `await response.arrayBuffer()`, decodes via `decodeLatinLibraryHtmlBytes`, and calls `parseLatinLibraryOpenText` (wired by C8 in Phase 3; C6 provides the pluggable hook/stub in Phase 2).
        - Stores the parsed `OpenTextDocument` in IndexedDB alongside reading position.
     4. Renders the current `OpenTextPage` (matched by `?page=<OpenTextPage.id>` or `?section=`, defaulting to `doc.pages[0]`) into `[data-role="open-text-mount"]` using `setHtml` from `@/web/ui/core/dom/dom.client` (re-exported by `@/web/ui/core/index.client`) and `<morcus-reader-view>`:
        - Renders each `OpenTextBlock` (`kind: "heading" | "paragraph" | "line"`) and its `segments` (`OpenTextRun` with `style?: { italic, bold, smallCaps, superscript, subscript }` and `lang`, plus `OpenTextSectionMarker` `{ kind: "section", label }` for gutter/inline citations and `OpenTextPage.notes` for footnotes).
        - Displays the **"Uncurated"** badge and **source badge** (`sourceMeta.label`) in the reader header (`reader-text-meta`, per `read_section_mockup.html`), plus "About this text" (source link `entry.sourceUrl`, license `entry.license`, `entry.statedEdition`, the best-effort no-promise notice, and `entry.partialCoverage` link if present).
        - Supports prev/next `OpenTextPage` navigation and page/column jump (`?open=<id>&page=<pageId>`).

---

### 2.5 Contract 5: `citationStyle: "roman_law"` & Small-Caps Inscriptions (`C3`, `C7`)

Defined in:

- [`src/common/library/library_types.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/library/library_types.ts) (`CitationStyle = "default" | "roman_law"`, `DocumentInfo.citationStyle`)
- [`src/common/library/preprocess/preprocessed_types.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/library/preprocess/preprocessed_types.ts) (`V2PreprocessedWork.citationStyle`, `V2WorkSummary.citationStyle`)
- [`src/common/library/process_thelatinlibrary.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/library/process_thelatinlibrary.ts) (`TheLatinLibraryWork.citationStyle`, `EditorialSegment.style?: "default" | "smallcaps"`)

1. **Four Rules of `citationStyle: "roman_law"` (Decision #21)**:
   - **Rule A (`pr` $\rightarrow$ _principium_, owned by C3)**:
     - In `src/common/library/section_labels.ts`, when `citationStyle === "roman_law"` and `idPart.toLowerCase() === "pr"`, render `"Principium"` (not `"Praefatio"`).
   - **Rule B (Digest Books 30–32 Title `0` Elision & Lookup Alias, owned by C3)**:
     - When `citationStyle === "roman_law"` and `textParts[i]?.toLowerCase() === "title"` and `id[i] === "0"`, omit `Title 0` from human-readable labels (`"Book 30"`, `"Book 30, Lex 79, Paragraph 1"`) and accept `30.79.1` / `30.79` / `30.1pr` as lookup/jump aliases in `work_preprocessor.ts`, `reader_loader.server.ts` (`resolvePageInWork`), and `reader_toc.client.ts`.
   - **Rule C (Compact `pr` Display Format `1.1.1pr` / Gutter `1pr`, owned by C3)**:
     - When `citationStyle === "roman_law"`, format dot-joined citations and local gutter labels with `"pr"` attached directly to the preceding numeric law/chapter part (`"1.1.1pr"`, local gutter `"1pr"`), while accepting both `"1.1.1pr"` and `"1.1.1.pr"` on lookup.
   - **Rule D (Jurist Inscription Once per _Lex_ in Small Caps — C3 Consumer + C7 Producer)**:
     - **Consumer (owned by C3 in Phase 2)**: In `src/common/library/preprocess/work_preprocessor.ts` (`compileXmlNodeToHtml`), when an editorial `<span kind="editorial">` also carries attribute `style="smallcaps"`, emit `<span class="reader-editorial reader-editorial-smallcaps" data-no-tokenize="true">${escaped}</span>`, and style `.reader-editorial-smallcaps` (`font-variant: small-caps`) in `src/web/ui/reader/reader_text.css`.
     - **Producer (owned by C7 in Phase 3)**: In `src/scripts/thelatinlibrary/digest.ts`, attach the jurist inscription `{ editorial: pendingInscription, style: "smallcaps" }` only to the first row of each _lex_, and in `src/common/library/process_thelatinlibrary.ts` (`rowNode`), emit `new XmlNode("span", [["kind", "editorial"], ["style", "smallcaps"]], [segment.editorial])` when `segment.style === "smallcaps"`.

---

## 3. UI V2 Whole-System Conformance Rules (For C3, C4, C5, C6, C8)

Any cell touching `src/web/ui/` or UI-rendered `src/common/` code must run `./morcus.sh test --whole-system` before committing and adhere to:

1. **DOM Writes (`dom.client.ts` & `inventory_ratchet.test.ts`)**: Never use raw `innerHTML =`, `outerHTML =`, `createElement`, `appendChild`, `insertBefore`, or `replaceChildren` in `*.client.ts`. Always use `setHtml(target, html\`...\`)`or`replaceWithHtml(target, html\`...\`)`from`@/web/ui/core/dom/dom.client`(re-exported by`@/web/ui/core/index.client`).
2. **JS Gate (`gate_conformance.test.ts`)**: Never emit `<noscript>` in templates; use `data-nojs-only` and `data-js-only`.
3. **Boot & Activation Gate (`boot_conformance.test.ts`)**:
   - No import-time side effects in `*.client.ts` beyond `registerElement(...)`.
   - `onConnect()` must be synchronous (`protected override onConnect(): void`, never `async onConnect()`).
   - No dynamic `import(...)` in `*.client.ts`.
   - Augment `MorcusElementTagNameMap` (`declare module "@/web/ui/core/dom/js_gate.client"`), never `HTMLElementTagNameMap`, and never import another module's `Morcus*` class directly (use `closestUpgraded` / `queryUpgraded`).
4. **CSS Audit (`css_audit_conformance.test.ts`)**: Every CSS class, `data-*` attribute, and `morcus-*` element in `.css` files must be referenced as a literal in a non-test `.ts` file under `src/`, with no dead shadowed declarations and no $\ge 3$-property duplicate rule blocks across files.
