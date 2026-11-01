# Implementation Plans for Flash Next Cells (C1, C7, C8)

This document provides step-by-step implementation plans, exact file lists, algorithms, edge cases, CLI commands, and concrete acceptance checks for the three plan-driven cells:

1. **Cell C1 (`scraper`)** — M1: The Latin Library Upstream Snapshot (`src/scripts/thelatinlibrary/crawl/**`, `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary`)
2. **Cell C7 (`porter`)** — M2b: Strict Layer & Porting All 6 Pilot Works (`src/scripts/thelatinlibrary/*.ts`, `src/common/library/process_thelatinlibrary.ts`)
3. **Cell C8 (`lladapter`)** — M5: The Latin Library in Open Texts (`src/common/open_texts/latin_library_adapter.ts`, `src/common/open_texts/latin_library_catalog.ts`)

---

## 1. Cell C1 (`scraper`) — M1: The Latin Library Upstream Snapshot

### 1.1 Branch & Scope

- **Branch**: `git checkout -b lr/c1-scraper library-release`
- **Owned Codebase Files**:
  - `src/scripts/thelatinlibrary/crawl/provenance_scanner.ts` + `.test.ts`
  - `src/scripts/thelatinlibrary/crawl/crawler.ts` + `.test.ts`
  - `src/scripts/thelatinlibrary/crawl/build_work_index.ts` + `.test.ts`
  - `src/scripts/thelatinlibrary/crawl/run_crawl.ts` (CLI runner)
  - `upstream_sources.lock.json` (append `"thelatinlibrary"` immediately after `"gaffiot"` only; see Step 4)
- **Owned Upstream Data Repo**:
  - `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary` (`raw/`, `manifest.json`, `work_index.json`, `works/`)
- **Must NOT Touch**:
  - Top-level `src/scripts/thelatinlibrary/*.ts` (owned by C7), `src/common/**`, `src/web/**`.

### 1.2 Step-by-Step Implementation Plan

#### Step 0: Commit Pilot Baseline & Backfill `sha256` in `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary`

1. Currently `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary` has one local commit (`"snapshot before regen"`) and uncommitted Digest files (`manifest.json`, `raw/justinian/`, `works/thelatinlibrary-justinian-digesta.json`).
2. Before running the crawler, commit those uncommitted pilot files as `"Commit pilot Digest and manifest baseline"` and tag that commit `pilot-baseline` (`git tag -f pilot-baseline`) so C7 (`porter`) has an exact baseline commit to diff `works/*.json` against (Decision #4).
3. Backfill `sha256` (lowercase hex SHA-256 of the corresponding `raw/<path>.html` bytes) into all existing `raw/**/*.meta.json` files so every `.meta.json` file on disk satisfies `RawPageMeta` (`{ url, retrieved, sha256 }`).

#### Step 1: Provenance & Copyright Scanner (`src/scripts/thelatinlibrary/crawl/provenance_scanner.ts`)

Because C1 runs in parallel with C2 (`pagelayer`), C1 **must not** depend on C2 and **must not** call `extractPage` from `src/scripts/thelatinlibrary/page.ts` (which throws on non-standard page layouts). Instead, import `parseBody`, `isElement`, `textOf`, and `type HtmlElement` from `src/scripts/thelatinlibrary/html.ts` (**read-only — never edit `src/scripts/thelatinlibrary/html.ts`, which is owned by C7**) and write a local recursive walk helper inside `src/scripts/thelatinlibrary/crawl/` to collect `<p>` / `<div>` elements (and `<a>` links for the crawler), extracting `bodyText = textOf(body)` and `paragraphsText = collectElements(body, el => el.tagName === "p" || el.tagName === "div").map(textOf)`.

Implement a pure, unit-tested function:

```ts
export interface ProvenanceScanResult {
  provenance: "noStatement" | "statementFound";
  provenanceClassification: "none" | "pre1930" | "post1930_or_copyright";
  provenanceStatements: string[];
  statedEdition: string | null;
  excluded: boolean;
  exclusionReason?: string;
}

export function scanPageProvenance(
  pagePath: string,
  bodyText: string,
  paragraphsText: readonly string[]
): ProvenanceScanResult;
```

- **Algorithm**:
  1. Scan `paragraphsText` (and `bodyText`) using the provenance regexes from `src/scripts/thelatinlibrary/onboard.ts`:
     - Edition/source keywords: `/\b(?:edidit|ediderunt|ex\s+recensione|recensuit|recognovit|edited\s+by|edition|transcribed\s+by|prepared\s+by|source\s*:|text\s+from|taken\s+from|from\s+the\s+edition|teubner|loeb|oxonii|clarendon|migne|patrologia|csel|mgh|monumenta\s+germaniae|berlin\s*:|leipzig\s*:|lipsiae|mommsen|krueger|mueller|halm|kempf|divjak)\b/i`
     - Copyright/permission keywords (Decision #20): `/\b(?:copyright|©|all\s+rights\s+reserved|permission|by\s+permission|reprinted\s+with)\b/i`
  2. Collect all matching lines/paragraphs (up to 600 chars each, ignoring boilerplate nav/footer strings `"The Latin Library"`, `"The Classics Page"`, `"Neo-Latin"`).
  3. **Post-1930 & Copyright Exclusion Rules (Decision #20)**:
     - Flag `provenanceClassification: "post1930_or_copyright"` and `excluded: true` (with `exclusionReason`) if:
       - Any matched provenance line contains a copyright/permission notice (`copyright`, `©`, `all rights reserved`, `by permission`), OR
       - Any matched provenance line names a publication/edition year $\ge 1930$ (`/\b(19[3-9]\d|20[0-2]\d)\b/`), OR
       - `pagePath` belongs to one of the known post-1930 works identified in the stage-4 audit (`verified_audit_v2.json`):
         1. `augustine/epist.firmus.html` (Augustine _Epistula 1A\* / 2\* Divjak_, first published 1981)
         2. `jfkhonor.html` (1963 Free University of Berlin diploma for J. F. Kennedy)
         3. `declaratio.html` (1948 Universal Declaration of Human Rights Latin translation)
         4. `ency.fides.html` (1998 Pope John Paul II encyclical _Fides et Ratio_)
         5. `bill.rights.html` (Modern Neo-Latin translation of the U.S. Bill of Rights)
  4. **Pre-1930 Known Editions**:
     - Preserve the pilot's `KNOWN_EDITIONS` map (`justinian/digest*.html` $\rightarrow$ `"Mommsen-Krueger (Digesta Iustiniani Augusti, Berlin, 1870)"`; `justin/prologi.html` $\rightarrow$ `"Ruehl / Jeep (Teubner, Leipzig, 1886)"`) and extract any explicit pre-1930 edition string into `statedEdition`.

#### Step 2: Resumable Rate-Limited Crawler (`src/scripts/thelatinlibrary/crawl/crawler.ts`)

Implement the live-site crawler for `https://www.thelatinlibrary.com/` (Decision #9):

- **Politeness & Rate-Limiting (Decision #9)**:
  - Minimum delay of **2,000 ms (1 request per 2 seconds)** between **every** HTTP request (including 304 checks and retries).
  - Required HTTP header:
    `User-Agent: MorcusNet/1.0 (+https://morcus.net; Latin philology snapshot)`
- **Discovery, Resumability & Re-Fetch Only on Change (Decision #9)**:
  1. Seed URLs: start from `https://www.thelatinlibrary.com/index.html` and hub index pages (`christian.html`, `medieval.html`, `neo.html`, `misc.html`, `ius.html`, `bible.html`), plus all author index pages linked from them and all `ll_paths` in `/usr/local/google/home/nkprasad/.gemini/jetski/brain/fb1ed726-62bb-45e1-adf0-2508597ffa90/scratch/results/stage4/verified_audit_v2.json` (converted from `.txt` to `.html` / `.shtml`).
  2. Follow internal `.html` / `.shtml` links within `www.thelatinlibrary.com` (normalizing relative paths, stripping `#fragment` and query strings).
  3. **Resumable Session State vs. Re-Fetch Only on Change**:
     - Maintain a transient session state file `$THELATINLIBRARY_ROOT/.crawl_state.json` (add `.crawl_state.json` to `$THELATINLIBRARY_ROOT/.gitignore`) recording `{ visitedPaths: string[], failedPaths: Record<string, string> }` for the current crawl run:
       - **Resume**: If the crawler is interrupted and re-started (without `--refresh`), any `pagePath` already in `.crawl_state.json` (or already on disk in `raw/<pagePath>` with a valid `raw/<pagePath>.meta.json`) is skipped so the run finishes without re-requesting already-fetched pages.
       - **Refresh (`--refresh`) / Change Detection**: When checking an existing `raw/<pagePath>`, send a conditional GET (`If-Modified-Since` / `If-None-Match` if recorded) or fetch the raw `Buffer` (`Buffer.from(await response.arrayBuffer())` — **write raw bytes without decoding/re-encoding so ISO-8859-1 files are preserved verbatim**), compute its lowercase hex SHA-256, and **only rewrite `raw/<pagePath>` and update `retrieved` in `raw/<pagePath>.meta.json` if the SHA-256 differs from the existing file on disk**.
       - Record any dead link (HTTP 404/5xx after retry) in `failedPaths` rather than aborting the crawl.
  4. **Manifest Generation (`$THELATINLIBRARY_ROOT/manifest.json`)**:
     - Scan all `raw/<pagePath>` files, run `scanPageProvenance`, and write `$THELATINLIBRARY_ROOT/manifest.json` (`SnapshotManifest` from `src/common/thelatinlibrary/snapshot_types.ts`), preserving any existing `checks` arrays recorded by `onboard.ts` for the 6 pilot works.

#### Step 3: Work Index & Identity Map Builder (`src/scripts/thelatinlibrary/crawl/build_work_index.ts`)

Build `$THELATINLIBRARY_ROOT/work_index.json` (`SnapshotWorkIndex` from `src/common/thelatinlibrary/snapshot_types.ts`) by combining:

1. The stage-4 verified audit (`/usr/local/google/home/nkprasad/.gemini/jetski/brain/fb1ed726-62bb-45e1-adf0-2508597ffa90/scratch/results/stage4/verified_audit_v2.json`) and intra-LL duplicate table (`/usr/local/google/home/nkprasad/.gemini/jetski/brain/fb1ed726-62bb-45e1-adf0-2508597ffa90/scratch/results/stage4/ll_file_duplicates.json`).
2. The crawled author/index link order in `$THELATINLIBRARY_ROOT/raw/`.
3. The promoted works in `$THELATINLIBRARY_ROOT/works/*.json` and the Morcus Library catalog.

- **Complete Rules for `SnapshotWorkEntry` Fields**:
  1. **`status` (`"in_library" | "partial" | "excluded" | "candidate"`)**:
     - **`"excluded"` (Decision #20)**: Any work where any constituent page has `excluded === true` or `provenanceClassification === "post1930_or_copyright"` in `manifest.json` (including the 5 post-1930 works in Step 1). Populate `exclusionReason`.
     - **`"in_library"` (Strategy Position 1)**:
       - All 233 works in `present_same_works` and all 14 works in `different_name_crosswalk` from `verified_audit_v2.json` (populate `libraryWorkIds` from `perseus_id` / `hypotactic_id` / `phi_json_id`), **PLUS**
       - Any work whose `workId` or source URL matches a `.json` file present in `$THELATINLIBRARY_ROOT/works/*.json` (currently the 6 pilot works: `thelatinlibrary-augustus-resgestae`, `thelatinlibrary-quintilian-declamationesmaiores`, `thelatinlibrary-justin-epitoma`, `thelatinlibrary-trogus-prologi`, `thelatinlibrary-gaius-institutiones`, `thelatinlibrary-justinian-digesta`). Checking `works/*.json` dynamically ensures newly promoted works flip from `"candidate"` to `"in_library"` automatically.
     - **`"partial"` (Decision #19)**:
       - The 16 works in `partial_coverage_works` from `verified_audit_v2.json` (unless promoted to `works/*.json` or excluded).
       - Populate `partialCoverage: PartialCoverageInfo`:
         - `libraryWorkId`: `entry.perseus_id ?? entry.hypotactic_id ?? entry.phi_json_id`
         - `libraryAuthor`: `entry.perseus_author ?? entry.ll_author`
         - `libraryTitle`: `entry.perseus_title ?? entry.ll_title`
         - `libraryUrl`: Resolve `libraryWorkId` against Morcus Library work metadata (`ALL_SUPPORTED_WORKS` / `library.db` `urlAuthor` and `urlName`) to `"/work/" + urlAuthor + "/" + urlName`; if no direct slug match is found, fall back to `"/library?q=" + encodeURIComponent(libraryAuthor)`.
         - `note`: `entry.notes`
     - **`"candidate"` (Decision #18)**:
       - All remaining works in `classical_and_late_antique_missing`, `patristic_christian_missing`, `medieval_works`, `neolatin_works`, plus any crawled text pages in `raw/` not present in `verified_audit_v2.json` (see Rule 4 below).
  2. **`period` (`"classical" | "late_antique" | "patristic" | "medieval" | "neolatin"`)**:
     - For `classical_and_late_antique_missing`: if `entry.era === "late_antique"` or `entry.source_shard` is `"shard_07_late_antique_prose"` / `"shard_08_late_antique_poetry"`, set `"late_antique"`; otherwise `"classical"`.
     - For `patristic_christian_missing`: `"patristic"`.
     - For `medieval_works`: `"medieval"`.
     - For `neolatin_works`: `"neolatin"`.
     - For `partial_coverage_works`, `different_name_crosswalk`, `present_same_works`: map `entry.era` (`"classical" | "late_antique" | "patristic" | "medieval" | "neolatin"`).
  3. **Stable `workId` Convention**:
     - For the 6 promoted pilot works in `works/*.json`: use their exact `workId` (`"thelatinlibrary-augustus-resgestae"`, etc.).
     - For all other works: `"ll/" + slugify(author) + "-" + slugify(shortTitleOrFirstFileStem)` where `slugify(s)` lowercases ASCII letters/digits, strips parentheticals, replaces runs of non-alphanumerics with `"-"`, and deduplicates collisions by appending `"-2"`, `"-3"`, etc.
  4. **Rule for Unaudited Pages in `raw/`**:
     - Skip top-level hub/navigation pages (`index.html`, `christian.html`, `medieval.html`, `neo.html`, `misc.html`, `ius.html`, `bible.html`, `indices.html`, `credits.html`) and pure author-index pages that contain only links to work subpages.
     - Any remaining crawled content page in `raw/` not covered by `verified_audit_v2.json`: group by `(authorPage, work title prefix)` in index link order, infer `period` from the hub page that linked to its author (`christian.html` $\rightarrow$ `"patristic"`, `medieval.html` $\rightarrow$ `"medieval"`, `neo.html` $\rightarrow$ `"neolatin"`, otherwise `"classical"`), run provenance/exclusion checks, and assign `status: "excluded"` (if post-1930/copyright) or `"candidate"`.
  5. **Intra-LL Duplicate Stripping & Natural Page Ordering**:
     - Convert `.txt` paths in `verified_audit_v2.json` (`ll_paths`) to their corresponding `.html` paths in `raw/`.
     - Strip any file listed in `entry.redundant_files`, `entry.alternate_edition_files`, or as `smaller` with `same_audit_entry: true` in `ll_file_duplicates.json` (recording stripped files in `redundantOrAlternatePages`).
     - Order `pages` in index link order / natural numeric book order (`praefatio.html`, `1.html`, `2.html`, …, `10.html`).

#### Step 4: Push Snapshot Repo & Pin in `upstream_sources.lock.json`

1. In `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary`:
   - Set remote `origin` to `git@github.com:nkprasad12/TheLatinLibrary.git`.
   - Commit `raw/`, `manifest.json`, `work_index.json`, and `works/*.json` on branch `main` and push `main` and `pilot-baseline` to `origin`.
2. In the Morcus worktree (`lr/c1-scraper`):
   - Because `./morcus.sh upstream pin` requires the source key to exist in `upstream_sources.lock.json` first (`src/scripts/upstream/pin.ts`), **append `"thelatinlibrary"` at the very end of `"sources"` in `upstream_sources.lock.json`, immediately after `"gaffiot"`** (disjoint from C5's insertion point after `"phi-public-domain-json"`), using an `https://` URL like all other entries:
     ```json
     "thelatinlibrary": {
       "repo": "https://github.com/nkprasad12/TheLatinLibrary.git",
       "branch": "main",
       "commit": "<40-char-sha>",
       "env": "THELATINLIBRARY_ROOT"
     }
     ```
   - Run `./morcus.sh upstream tag thelatinlibrary` (to push the `morcus-pin/<sha>` annotated tag to GitHub), `./morcus.sh upstream verify`, and `./morcus.sh upstream status`.
   - Note: `set_up_or_update.sh` automatically iterates over `upstream_sources.lock.json` via `list_sources`, so `"env": "THELATINLIBRARY_ROOT"` wires `THELATINLIBRARY_ROOT` into `set_up_or_update.sh` with zero edits to `set_up_or_update.sh`.

### 1.3 Concrete Acceptance Checks for C1

- [ ] `npx tsc --noEmit` and `./morcus.sh test src/scripts/thelatinlibrary/crawl` pass.
- [ ] Unit tests in `crawler.test.ts` verify:
  - the 2,000 ms rate limiter using Jest fake timers;
  - the `User-Agent` header containing `https://morcus.net` is sent on every request;
  - unchanged files (matching SHA-256) do not overwrite `retrieved` in `.meta.json`.
- [ ] Every page linked from an index page was fetched into `raw/` (or recorded in `failedPaths`), and every `raw/<path>` file has a `raw/<path>.meta.json` whose `sha256` matches the file on disk.
- [ ] `$THELATINLIBRARY_ROOT/manifest.json` and `$THELATINLIBRARY_ROOT/work_index.json` validate against `SnapshotManifest` and `SnapshotWorkIndex`.
- [ ] All 6 pilot works have `status: "in_library"`, all 16 partial-coverage works have `status: "partial"` with valid `partialCoverage`, and all post-1930 / copyright works (including the 1981 Divjak letter, 1963 JFK diploma, 1948 UDHR, 1998 _Fides et Ratio_, and Bill of Rights) have `status: "excluded"` in `work_index.json`.
- [ ] `./morcus.sh upstream verify` and `./morcus.sh upstream status` succeed.

---

## 2. Cell C7 (`porter`) — M2b: Strict Layer & Porting All 6 Pilot Works

### 2.1 Branch & Scope

- **Branch**: `git checkout -b lr/c7-porter library-release` (runs in Phase 3 after C1, C2, and C3 are merged into `library-release`)
- **Owned Codebase Files**:
  - `src/scripts/thelatinlibrary/strict_markers.ts` + `.test.ts`
  - `src/scripts/thelatinlibrary/{html,page,onboard,bracketed_chapters,checks,declamation,digest,gaius,justin}.ts` + tests
  - `src/common/library/process_thelatinlibrary.ts` + `.test.ts`
  - `src/web/ui/reader/reader_dialogs.server.ts` + `.test.ts` (if any About-panel refinement is needed)
  - `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary/{works/*.json,manifest.json}`
  - `upstream_sources.lock.json` (re-pinning `thelatinlibrary` after regenerating `works/*.json`)
- **Must NOT Touch**:
  - `src/scripts/thelatinlibrary/crawl/**` (owned by C1), `src/common/thelatinlibrary/**` (owned by C2), `src/common/open_texts/**` (owned by C5/C8).

### 2.2 Step-by-Step Implementation Plan

#### Step 1: Re-wire `html.ts` and `page.ts` on top of C2's Lenient Page Layer (M2a / M2b)

1. In `src/scripts/thelatinlibrary/html.ts`:
   - Keep all existing export names (`HtmlNode`, `HtmlElement`, `parseBody`, `isElement`, `isText`, `getAttr`, `hasClass`, `textOf`, `normalizeSpace`, `wordTokens`) so `crawl/`, `checks.ts`, `digest.ts`, `gaius.ts`, and `justin.ts` continue to compile, delegating `isElement`, `getAttr`, `hasClass`, and `textOf` (via `extractText`) to `@/common/thelatinlibrary` and keeping `parseBody(rawHtml: string): HtmlElement` using `parse5.parse(rawHtml)`.
2. In `src/scripts/thelatinlibrary/page.ts`:
   - Replace the duplicate DOM walking logic in `extractPage(rawHtml, label)` with a call to `extractLenientPage(rawHtml, { parser: parse5BodyParser })` from `@/common/thelatinlibrary`.
   - Enforce strictness in `extractPage`:
     - Filter `lenient.warnings` against a small, explicitly reviewed per-page warning allowlist (empty by default; only add an entry if `extractLenientPage` reports a non-fatal warning on one of the 6 pilot works that the pilot's `extractPage` accepted), and `assert(unallowedWarnings.length === 0, `${label}: ${unallowedWarnings[0]}`)`.
     - Assert `lenient.pageTitle.length > 0` and `lenient.footerText !== undefined`.
     - Return `{ pageTitle: lenient.pageTitle, nav: lenient.nav, headings: lenient.headings, paragraphs: lenient.paragraphs, bodyText: lenient.bodyText }`.
3. In `src/scripts/thelatinlibrary/onboard.ts`:
   - Update `FETCH_DELAY_MS = 2000` (Decision #9; `onboard.ts` had `500`), and never pass `--refetch` when regenerating the 6 works.
   - When updating `manifest[relPath]` for the 6 pilot works, **preserve C1's extended `SnapshotPageEntry` fields** (`provenanceClassification`, `workId`, `authorPage`, `statedEdition`, `excluded`, `exclusionReason`) by spreading `...manifest[relPath]` before setting `{ url, retrieved, sha256, provenance, provenanceStatements, checks }`.

#### Step 2: Shared `splitAtSequentialMarkers` (`src/scripts/thelatinlibrary/strict_markers.ts`)

1. Extract and generalize the sequential marker splitting logic used by `bracketed_chapters.ts`, `justin.ts`, and `declamation.ts` into `src/scripts/thelatinlibrary/strict_markers.ts`:

   ```ts
   export interface SequentialSplitOptions {
     label: string;
     markerPattern?: RegExp;
     /** Whether multiple markers may appear inside a single `<p>` (e.g. Declamations 9 & 17). */
     allowInlineSplits?: boolean;
     /** Text before `[1]` becomes section `"pr"` when true. */
     allowLeadingPr?: boolean;
   }

   export function splitAtSequentialMarkers(
     paragraphs: readonly string[],
     options: SequentialSplitOptions
   ): [sectionId: string, text: string][];
   ```

2. Express `bracketed_chapters.ts` (`extractBracketedChapters`), `declamation.ts` (`splitInlineSections`), and `justin.ts` chapter splitting in terms of `splitAtSequentialMarkers` + `checkSequentialIds` from `checks.ts`.

#### Step 3: Update Gaius & Digest for `citationStyle: "roman_law"` and Once-Per-_Lex_ Small-Caps Inscriptions (Decision #21)

1. **Gaius (`src/scripts/thelatinlibrary/gaius.ts`)**:
   - Set `citationStyle: "roman_law"` on the returned `TheLatinLibraryWork` object (`thelatinlibrary-gaius-institutiones.json`).
2. **Digest (`src/scripts/thelatinlibrary/digest.ts`)**:
   - Set `citationStyle: "roman_law"` on the returned `TheLatinLibraryWork` object (`thelatinlibrary-justinian-digesta.json`).
   - **Inscription Deduplication & Small-Caps Style (Decision #21, Rule D Producer)**:
     - Ensure that within each `(book, title, lex)`, **only the first row of that _lex_** (whether `pr` or an undivided law `[book, title, lex]`) carries the jurist inscription `EditorialSegment`, and attach `style: "smallcaps"`:
       ```ts
       const rowText: RowText =
         pendingInscription === undefined
           ? body
           : [{ editorial: pendingInscription, style: "smallcaps" }, body];
       ```
3. **Wire `EditorialSegment.style === "smallcaps"` in `src/common/library/process_thelatinlibrary.ts` (Rule D Producer)**:
   - In `rowNode(text: RowText)`:
     ```ts
     typeof segment === "string"
       ? segment
       : new XmlNode(
           "span",
           segment.style === "smallcaps"
             ? [
                 ["kind", "editorial"],
                 ["style", "smallcaps"],
               ]
             : [["kind", "editorial"]],
           [segment.editorial]
         );
     ```
   - Add unit tests in `src/common/library/process_thelatinlibrary.test.ts` verifying that `citationStyle: "roman_law"` is preserved on `DocumentInfo` and `style: "smallcaps"` emits `XmlNode("span", [["kind", "editorial"], ["style", "smallcaps"]], ...)`.

#### Step 4: Regenerate All 6 Works, Verify Parity, Push & Re-Pin `thelatinlibrary`

1. Run `onboard.ts` (without `--refetch`) using the existing UTF-8 file read for parity:
   ```bash
   THELATINLIBRARY_ROOT=/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary \
     npm run tsnp src/scripts/thelatinlibrary/onboard.ts
   ```
2. Diff the 6 regenerated files in `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary/works/*.json` against the `pilot-baseline` tag (`git -C /usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary diff pilot-baseline -- works/`):
   - `thelatinlibrary-augustus-resgestae.json`: **0 diffs** (byte-identical).
   - `thelatinlibrary-quintilian-declamationesmaiores.json`: **0 diffs** (byte-identical).
   - `thelatinlibrary-justin-epitoma.json`: **0 diffs** (byte-identical).
   - `thelatinlibrary-trogus-prologi.json`: **0 diffs** (byte-identical).
   - `thelatinlibrary-gaius-institutiones.json`: **Only** the added `"citationStyle": "roman_law"` field.
   - `thelatinlibrary-justinian-digesta.json`: **Only** `"citationStyle": "roman_law"` and `"style": "smallcaps"` on jurist inscriptions (plus any deduplicated inscription if applicable).
3. Commit `works/*.json` and `manifest.json` in `/usr/local/google/home/nkprasad/Documents/proj/morcus/thelatinlibrary`, push to `git@github.com:nkprasad12/TheLatinLibrary.git`, and update the pin in `upstream_sources.lock.json`:
   ```bash
   ./morcus.sh upstream pin thelatinlibrary@main
   ./morcus.sh upstream verify
   ```

### 2.3 Concrete Acceptance Checks for C7

- [ ] `npx eslint --cache src/web/ui && npm run lint:css && npx tsc --noEmit` pass.
- [ ] `./morcus.sh test` and `./morcus.sh test --whole-system` pass.
- [ ] All 4 non-law works (`resgestae`, `declamationesmaiores`, `justin-epitoma`, `trogus-prologi`) regenerate **byte-identically** to `pilot-baseline`.
- [ ] `gaius-institutiones` and `justinian-digesta` differ from `pilot-baseline` **only** in `"citationStyle": "roman_law"` and `"style": "smallcaps"` on once-per-_lex_ jurist inscriptions.
- [ ] `./morcus.sh upstream verify` passes with the updated lock file.

---

## 3. Cell C8 (`lladapter`) — M5: The Latin Library in Open Texts

### 3.1 Branch & Scope

- **Branch**: `git checkout -b lr/c8-lladapter library-release` (runs in Phase 3 after C1, C2, C5, and C6 are merged into `library-release`)
- **Owned Codebase Files**:
  - `src/common/open_texts/latin_library_adapter.ts` + `.test.ts`
  - `src/common/open_texts/latin_library_catalog.ts` + `.test.ts`
  - Targeted integration edits in:
    - `src/common/open_texts/catalog_builder.ts` (calling `buildLatinLibraryOpenTextEntries`)
    - `src/web/ui/open_texts/open_text_reader.client.ts` (fetching `arrayBuffer()` $\rightarrow$ `decodeLatinLibraryHtmlBytes` $\rightarrow$ `parseLatinLibraryOpenText` when `entry.format === "thelatinlibrary_html"`)
    - `src/bundler/client_bundle_budget.ts` (if needed for bundle size)
    - `src/web/ui/core/conformance/route_bundle_conformance.test.ts` (adding the `/opentexts?open=...` reader route case once C6's `<morcus-open-text-reader>` is merged; C5 only adds `/opentexts` in Phase 2)
- **Must NOT Touch**:
  - `src/common/thelatinlibrary/**` (owned by C2), `src/scripts/thelatinlibrary/**` (owned by C1/C7), `upstream_sources.lock.json` (owned by C7 in Phase 3).

### 3.2 Step-by-Step Implementation Plan

#### Step 1: Lenient Page Layer $\rightarrow$ `OpenTextDocument` Adapter (`src/common/open_texts/latin_library_adapter.ts`)

Implement a browser-safe adapter that converts one or more raw Latin Library HTML pages into the real `OpenTextDocument` model defined in [`src/common/open_texts/open_text_document.ts`](file:///usr/local/google/home/nkprasad/.gemini/jetski/worktrees/5a5fb7f8-fd8e-406f-81ec-5072d2fda673/swarm-architect-a69f6aba/src/common/open_texts/open_text_document.ts):

```ts
import type {
  OpenTextBlock,
  OpenTextDocument,
  OpenTextPage,
  OpenTextSegment,
} from "@/common/open_texts/open_text_document";
import type { HtmlBodyParser } from "@/common/thelatinlibrary";

export interface LatinLibraryPageInput {
  /** Relative file path, e.g. `"raw/columba1.html"`. */
  readonly path: string;
  /** Decoded HTML string (decoded via `decodeLatinLibraryHtmlBytes`). */
  readonly html: string;
}

export interface LatinLibraryAdapterOptions {
  readonly title?: string;
  readonly author?: string;
  readonly parser?: HtmlBodyParser;
}

export function parseLatinLibraryOpenText(
  pages: readonly LatinLibraryPageInput[],
  options?: LatinLibraryAdapterOptions
): OpenTextDocument;
```

- **Conversion Algorithm (matching `src/common/open_texts/open_text_document.ts`)**:
  1. For each page in `pages` (in reading order), call `extractLenientPage(page.html, { parser: options?.parser, preserveLineBreaks: true })` from `@/common/thelatinlibrary`. Collect `lenient.warnings` into `doc.warnings`.
  2. **Mapping `PageBlock`s & `DetectedMarker`s into `OpenTextBlock`s**:
     - **Segment construction for a block (`segments: OpenTextSegment[]`)**:
       - Each `DetectedMarker` in `block.markers` (sorted by `marker.offset`) becomes an `OpenTextSectionMarker`:
         `{ kind: "section", label: marker.value }`
       - Splice `{ kind: "section", label: marker.value }` into `segments` at `marker.offset`, wrapping the text slices before/between/after markers in `OpenTextRun` (`{ kind: "text", text: slice }`, preserving inline `italic` / `bold` / `smallCaps` style when inspecting `block.element`).
       - Note: For a `bracketed_number` (`[1]`) or `bare_number` (`1.`) marker at `offset === 0` whose raw marker text is already represented by `{ kind: "section", label: marker.value }`, strip the leading raw marker token (`[1]` + trailing space) from the following `OpenTextRun.text` so the section number is not rendered twice (once in the gutter and once inline).
     - **Heading blocks (`block.kind === "heading"`)**:
       - Emit `OpenTextBlock`: `{ kind: "heading", segments }`.
     - **Verse / multi-line blocks (`block.kind === "verse"` or `block.text.includes("\n")`)**:
       - Split the block on `"\n"` into non-empty lines.
       - Emit one `OpenTextBlock` with `kind: "line"` per line, setting `stanzaStart: true` on the first line of each `<p>` / verse block:
         `{ kind: "line", segments: lineSegments, ...(lineIdx === 0 ? { stanzaStart: true } : {}) }`.
     - **Prose paragraph blocks (`block.kind === "paragraph"` without `"\n"`)**:
       - Emit `OpenTextBlock`: `{ kind: "paragraph", segments }`.
     - **Fallback if `lenient.blocks` is empty**:
       - If `lenient.blocks.length === 0` and `lenient.bodyText.trim().length > 0`, split `lenient.bodyText` on blank lines into `{ kind: "paragraph", segments: [{ kind: "text", text }] }` blocks so no page renders empty.
  3. **Pagination (`OpenTextPage[]` and `pagination: "pageBreaks" | "chunks"`)**:
     - **Multi-page work (`pages.length > 1`)**:
       - Set `pagination: "pageBreaks"`.
       - Each input HTML page becomes an `OpenTextPage` (`id: String(idx + 1)`, `label: lenient.pageTitle || lenient.headings[0] || "Page " + (idx + 1)`, `blocks`, `notes: []`).
     - **Single-page work (`pages.length === 1`)**:
       - Set `pagination: "chunks"`.
       - Group `OpenTextBlock`s into `OpenTextPage` chunks targeting `DEFAULT_CHUNK_CHARS = 6000` characters (breaking cleanly at `kind === "heading"` boundaries when present), with `id: "1"`, `"2"`, … and `label` derived from the chunk's leading heading or `"Part 1"`, `"Part 2"`, … (or the work title when there is only 1 page).

#### Step 2: Latin Library Catalog Entry Builder (`src/common/open_texts/latin_library_catalog.ts`)

Implement `buildLatinLibraryOpenTextEntries`:

```ts
export function buildLatinLibraryOpenTextEntries(
  workIndex: SnapshotWorkIndex,
  manifest: SnapshotManifest,
  sourceCommit: string
): {
  sourceMeta: OpenTextSourceRepoMeta;
  entries: OpenTextCatalogEntry[];
};
```

- **Filtering & Automatic Tier Drop-Out (Strategy Position 1 & Decisions #18, #19, #20)**:
  1. Iterate over `workIndex.works`:
     - **Skip** if `work.status === "in_library"` (excludes all Perseus/Hypotactic/PHI overlaps and all 6 promoted pilot works in `$THELATINLIBRARY_ROOT/works/*.json`).
     - **Skip** if `work.status === "excluded"` (post-1930 / copyright exclusions).
     - **Include** only when `work.status === "candidate"` or `work.status === "partial"` (Decision #18: every LL work not in the Library and not excluded, medieval and Neo-Latin included).
  2. Also check `$THELATINLIBRARY_ROOT/works/*.json` dynamically if the directory is present: if a converted work JSON exists for `work.workId`, treat it as `"in_library"` and omit it.
  3. Construct `OpenTextCatalogEntry`:
     - `id`: `work.workId.startsWith("ll/") ? work.workId : "ll/" + work.workId.replace(/^thelatinlibrary-/, "")`
     - `source`: `"thelatinlibrary"`
     - `format`: `"thelatinlibrary_html"`
     - `author`: `work.author`
     - `title`: `work.title`
     - `period`: `work.period`
     - `files`: `work.pages.map(p => p.startsWith("raw/") ? p : "raw/" + p)`
     - `sourceUrl`: `manifest[work.pages[0]]?.url ?? "https://www.thelatinlibrary.com/" + work.pages[0]`
     - `license`: `"Public domain Latin text; HTML transcription from The Latin Library"`
     - `statedEdition`: `work.statedEdition ?? null`
     - `partialCoverage`: when `work.status === "partial"` and `work.partialCoverage` is present:
       ```ts
       {
         libraryWorkId: work.partialCoverage.libraryWorkId,
         libraryUrl: work.partialCoverage.libraryUrl,
         libraryAuthor: work.partialCoverage.libraryAuthor,
         libraryTitle: work.partialCoverage.libraryTitle,
         message: work.partialCoverage.note,
       }
       ```
     - `wordCount`: `work.wordCount`

#### Step 3: Wire into C5's Catalog Builder & C6's Client Reader (Including Byte Decoding)

1. In `src/common/open_texts/catalog_builder.ts`:
   - Load `$THELATINLIBRARY_ROOT/work_index.json` and `$THELATINLIBRARY_ROOT/manifest.json`, call `buildLatinLibraryOpenTextEntries(...)`, and merge `sourceMeta` and `entries` into `OpenTextCatalogBundle`.
   - Run `src/scripts/build_open_texts_catalog.ts` to regenerate `build/open_texts/open_texts_catalog.json` with both Patrologia Latina and The Latin Library entries.
2. In `src/web/ui/open_texts/open_text_reader.client.ts`:
   - When `entry.format === "thelatinlibrary_html"`:
     - Fetch each file in `entry.files` in parallel using `buildOpenTextFileUrls(sourceMeta, filePath)` (`raw.githubusercontent.com` primary, `cdn.jsdelivr.net` fallback).
     - Read raw bytes via `await response.arrayBuffer()` (NOT `response.text()`, which corrupts ISO-8859-1 files like `gaius1.html`) and decode via `decodeLatinLibraryHtmlBytes(buffer)` from `@/common/thelatinlibrary`.
     - Pass `{ path, html }[]` to `parseLatinLibraryOpenText`, cache the resulting `OpenTextDocument` in IndexedDB keyed by `(entry.id, sourceMeta.commit)`, and render in `<morcus-reader-view>`.

### 3.3 Concrete Acceptance Checks for C8

- [ ] `npx eslint --cache src/web/ui && npm run lint:css && npx tsc --noEmit` pass.
- [ ] `./morcus.sh test` and `./morcus.sh test --whole-system` pass.
- [ ] Unit tests in `latin_library_adapter.test.ts` verify:
  - single-page prose (`pagination: "chunks"`), single-page verse (`<br>` $\rightarrow$ `kind: "line"` with `stanzaStart: true`), bracketed section markers (`[1]` $\rightarrow$ `{ kind: "section", label: "1" }`), and multi-page works (`columba1.html` + `columba2.html` $\rightarrow$ `pagination: "pageBreaks"`, 2 `OpenTextPage`s);
  - ISO-8859-1 / windows-1252 byte decoding (`decodeLatinLibraryHtmlBytes`) preserves accented/Latin-1 characters without `U+FFFD`.
- [ ] Unit tests in `latin_library_catalog.test.ts` verify that `"candidate"` and `"partial"` works are included (medieval and Neo-Latin included, Decision #18), `"partial"` works carry `partialCoverage` with `libraryUrl` (Decision #19), and `"in_library"` / `"excluded"` works are omitted (with automatic drop-out when a work flips to `"in_library"`).
- [ ] **Mobile-Viewport & Reload Verification (Swarm Testing Policy)**:
  1. Start the dev server on C8's assigned port: `PORT=5769 ./morcus.sh web`.
  2. In a headless browser at a mobile viewport (`390x844`), open `http://localhost:5769/opentexts`, filter by source `The Latin Library`, and open:
     - a single-page `"candidate"` entry (e.g. Abbo of Fleury),
     - a multi-page `"candidate"` entry (e.g. Adomnán _Vita Sancti Columbae_, turning from page 1 to page 2), and
     - a `"partial"` entry (e.g. Apicius _De Re Coquinaria_), verifying that the partial-coverage note and link to the Morcus Library render.
  3. Reload the open text page (`page.reload()`) and verify that it re-renders cleanly from IndexedDB with zero network requests to `raw.githubusercontent.com` or `cdn.jsdelivr.net`.
