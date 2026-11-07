# Dictionary TODOs (`src/web/ui/dict/`)

Known follow-up work for this topic. See [`README.md`](README.md) for how the directory is organised.

---

## 1. Per-entry collapsible headers

**Status:** not started. Ergonomic enhancement (not a V1 parity issue).

### Motivation & Design

Make individual entry headers/headwords collapsible via the decoupled `<details class="entry-toggle">` pattern, mirroring dictionary card collapse.

- Register a revealer for collapsed entries (`registerRevealer`, [`core/nav/reveal.client.ts`](../core/nav/reveal.client.ts)) so anchor deep-links automatically expand them.
- Improves scanability on results with multiple long entries inside the same lexicon.

---

## 2. Table of Contents scroll tracking (Scroll-Spy)

**Status:** not started. Natural follow-up to the Table of Contents layout and drawer enhancements.

### Motivation

When browsing long, multi-sense dictionary entries alongside the sticky desktop TOC rail or mobile drawer, the Table of Contents currently acts as a static jump navigation menu. Users reading through extensive sense hierarchies (e.g. 67+ senses in _habeo_) must manually scroll the TOC to cross-reference their current position.

Scroll tracking provides live visual feedback indicating which sense, subsection, or lexicon entry is currently active in the reading viewport.

### Proposed Architecture

1. **IntersectionObserver Observation**:
   - In `MorcusDictToc` (`dict_toc.client.ts`), initialize an `IntersectionObserver` observing all sense target elements (`[id]` targets referenced by `.toc-link`) and dictionary cards (`.dict-card`).
   - Configure observer margins (e.g., `rootMargin: "-10% 0px -70% 0px"`) so the section occupying the top third of the viewport triggers the active state.
2. **Visual State**:
   - Apply an `.active` class (or `aria-current="true"`) to the corresponding `.toc-item`.
   - Style with an accent left border, bold ordinal, and subtle background tint in `dict_toc.css`.
3. **Synchronized Auto-Scroll**:
   - Automatically scroll `.toc-body` using `scrollIntoView({ block: "nearest", behavior: "smooth" })` to ensure the active sense item remains visible within the desktop rail or mobile drawer as the user reads.
4. **Link Click Decoupling**:
   - When a user clicks a TOC link (`a.toc-link`), temporarily suppress observer updates until the programmatic smooth-scroll animation settles, avoiding visual jitter or fighting between user clicks and observer callbacks.

---

## 3. Time-slice word tokenization

**Status:** potential; not planned. Only worth doing if the post-paint block below becomes a
problem in practice.

`enhanceWordsAfterPaint` (`entry/entry_links.client.ts`) tokenizes the results in one task right after
they paint, so the results and the scroll to them are no longer delayed. That task is still long on
big pages: with every default dictionary enabled, a search for `sum` (~5,900 words) blocks for
~190 ms on desktop and ~1.1 s at 4× CPU throttling (the long-animation-frame duration, including
rendering; measured when words were still anchors with an `href` each, so somewhat less now). Anything during it waits: scrolling, typing in the search box, and the reader itself
when the dictionary is its embedded panel, since the iframe shares the reader's main thread.

Shape, if it's needed:

- Chunk by text run, not by tokenize target: L&S `sum` is a single `.entry-content` of ~5,100
  words, so per-target batches don't help on the pages that matter. `collectTextRuns` in
  `core/text/tokenize.client.ts` already yields the runs.
- Process runs in document order with a ~8 ms budget per slice, yielding with `setTimeout(0)` /
  `MessageChannel` (not `requestIdleCallback`: Safari doesn't ship it, and we want the work done
  soon, not when idle). Start from the hashed section when the URL has one.
- Keep each slice free of layout reads, so its style and layout fold into the next frame.
- Cancel through the existing `"words"` lane when new results arrive or the element disconnects.

---

## 4. Session persistence of mobile TOC drawer state across lookups

**Status:** potential; deferred.

- On mobile (`< 1080px`), each dictionary lookup renders `<details class="toc-details" open>` at the default `30svh` height. Persisting the user's chosen drawer height and minimized/expanded state across AJAX and full-page lookups within a tab (e.g. via `sessionStorage`) is a potential future ergonomic enhancement.

---

## 5. Compress build-time stores concurrently

**Status:** potential; not started. Saves ~3 s per dictionary build.

`savePrecompressedJsonDb` ([`core/server/precompressed_json.server.ts`](../core/server/precompressed_json.server.ts))
compresses each entry with sync zlib (Brotli q10 + gzip 9) inside a synchronous SQLite
transaction, one entry at a time. Running the compressions concurrently on libuv's thread pool
cuts that sharply. Measured by re-compressing the real stores (24-core cloudtop):

| Store                            |   Rows (raw) |   Sync | Async, one at a time | Async, all at once (4 threads) | (8 threads) |
| :------------------------------- | -----------: | -----: | -------------------: | -----------------------------: | ----------: |
| `completions.db`                 | 386 (5.3 MB) | 3.63 s |               3.43 s |                     **0.98 s** |  **0.49 s** |
| corpus lemmata (`build/corpus/`) |  24 (0.3 MB) | 193 ms |               180 ms |                          61 ms |           — |

Making the calls async without running them concurrently gains nothing; the win is concurrency.

Shape, if it's done:

- Compress all entries (or bounded batches) with `Promise.all` first, then insert in the
  transaction. Memory stays ~2× the raw input (~10 MB for completions).
- `savePrecompressedJsonDb` and its callers (`completions_db.server.ts`,
  `corpus_serialization.ts`) become `async`.
- libuv defaults to 4 threads; set `UV_THREADPOOL_SIZE` for the build process to go further.
- Output is byte-identical (same settings), so stored data and parity tests don't change.
  `compressStaticPageAsync` ([`core/server/static_pages.server.ts`](../core/server/static_pages.server.ts))
  is the pattern; `pages.db` itself (8 pages, ~15 ms) isn't worth converting.

---

## 6. Lewis & Short reverse (English → Latin) search

**Status:** exploratory; deferred.

### Goal & Constraints

Make Lewis & Short searchable by English word (server-only) without relying on TEI `<hi rend="ital">` / `<trans>` markup (`lsEmph` / `lsTrans`), which is not applied consistently enough to serve as a hard filter.

### Corpus & Sense-Length Measurements (`ls.db`)

Measured across all 51,645 entries (`195.3 MB` total, `167 MB` of JSON/HTML in `entries`):

| Unit (plain text, HTML stripped)                 |      n | Mean | p50 | p75 |   p90 |   p95 |   p99 |    max |
| :----------------------------------------------- | -----: | ---: | --: | --: | ----: | ----: | ----: | -----: |
| **Sense, own text** (excluding nested subsenses) | 63,824 |  283 | 157 | 350 |   679 |   962 | 1,754 |  8,250 |
| Sense including subsenses (`outline.senses`)     | 63,824 |  573 | 261 | 613 | 1,295 | 2,007 | 4,590 | 65,823 |
| Blurb (pre-sense headword/etymology/root gloss)  | 51,645 |  130 |  95 | 150 |   250 |   351 |   726 |  6,430 |
| Whole entry                                      | 51,645 |  480 | 136 | 334 | 1,029 | 1,980 | 5,632 | 88,226 |

- Over half of all L&S entries (`p50 = 0` senses) have no `<li id>` senses at all—only the blurb.
- Sense `<li id>` elements are emitted flat in the HTML; hierarchy depth (`level: 1..5`) lives in `outline.senses`.
- Because the top ~15% of senses (> 500 chars) hold ~53% of all sense text (and individual senses reach 8.2 KB), results must render a short breadcrumb (`outline.senses[].text`) + a ~150-char snippet window rather than the whole sense.

### Build-Time Extraction & Ranking (Without Relying on Markup)

1. **Token classification & lemmatization:**
   - Split each entry into its blurb + each sense's own text (`115,469` units total).
   - Strip citation runs (`lsBibl` / author-work abbreviations in `src/common/lewis_and_short/ls_abbreviations.ts`).
   - Distinguish English from Latin tokens using the AGID word list (`src/common/lexica/english_words.ts`) + Morceus (`crunchWord`), resolving ambiguous words (_in, me, sole, dare, via..._) by surrounding run context.
   - Lemmatize English inflections to their base word via AGID (`bitterer` / `bitterness` → `bitter`, `ran` → `run`) rather than Porter stemming.
2. **Non-markup ranking signals (validated on real `"bitter"` / `"wormwood"` hits):**
   - **Strip or down-weight square-bracketed etymologies (`[...]`):** Blurb etymologies sit around char offset 30–60 and cite English glosses of Greek/Sanskrit cognates (e.g. _pix_ "pitch" and _pigeo_ "to repent" both have `[… Gr. πικρός, bitter]` at offset ~42 and otherwise rank near the top for `"bitter"`).
   - **Sense-heading & early-offset boost:** Matches in `outline.senses[].text` or near the start of a sense/blurb outrank matches buried thousands of characters deep in quotation commentary.
   - **Delimiter / run-length heuristics:** Standalone or comma/semicolon-delimited glosses (`; bitter, briny`, `to make bitter`) outrank multi-word noun phrases where the query is a modifier (`the bitter vetch` in _ervum_, `oil of bitter almonds` in _metopion_, `bitter lettuce` in _picris_).
   - **Proper-noun / biographical penalty:** Capitalized headwords (_Menippus_, _Archilochus_, _Lycambes_) contain long English biographical prose ("famous for his bitter sarcasms") and should rank below vocabulary entries.
   - `lsEmph` / `lsTrans` can still serve as a soft bonus when present.
3. **Automated evaluation with Smith & Hall:**
   - Use Smith & Hall (`sh.db`, English → Latin) headwords and their cited Latin equivalents as a ground-truth benchmark (recall@K / MRR) to tune scoring weights systematically.

### Storage Layout & Cold-Cache Performance Caveat

Prototype upper-bound over all 115,469 units (1.80M English tokens, 24,108 distinct terms, 1.44M `(term, sense)` postings; `p50 = 5`, `p90 = 42`, `p99 = 555` postings/term):

| `ls_search.db` Variant                                                        | Disk Size |
| :---------------------------------------------------------------------------- | --------: |
| Single-word `WITHOUT ROWID` postings (`PRIMARY KEY(termId, score DESC, ...)`) |  ~34.6 MB |
| + `(termId, senseRow)` secondary index for SQL-level multi-word AND           |  ~62.5 MB |
| + Sense plaintext / pre-built snippet text stored inline (no secondary index) |  ~63.3 MB |

> [!IMPORTANT] > **Cold OS page-cache caveat:** `warmLookupPages` ([`src/common/dictionaries/sqlite_backing.ts`](../../../common/dictionaries/sqlite_backing.ts)) warms only `orths` and the `entries_id` index (~4 MB for L&S), **not** the 167 MB of `entries` JSON/HTML (~47,700 4 KB pages).
>
> - **Index lookup (`ls_search.db`) is cheap even cold** (<1 ms, 1–2 leaf pages) _provided_ `(entryId, senseId)` is stored directly in `postings` rather than joined against a separate `senses` table (which would scatter 50 top hits across 50 random pages).
> - **Fetching matched entries from `ls.db` to build snippets at query time is expensive when cold:** common English words disproportionately hit large L&S entries (entries matching `"hand"` average `17.2 KB` of JSON, `"love"` `15.8 KB`, `"war"` `9.9 KB` vs. the `3.2 KB` L&S mean). Reading and `JSON.parse`-ing 30–50 scattered entries from `ls.db` means dozens of random disk reads and ~500–800 KB of JSON parsing per search.
> - **Mitigation:** Either (a) only fetch the top 5–6 entries from `ls.db` for the compact card on `/dicts` and paginate the full view, or (b) store the short snippet/header directly in `ls_search.db` (+20–25 MB) so rendering reverse-search results never touches `ls.db`.

### Open UX Questions

1. **Relationship to Smith & Hall on `/dicts?q=...`:**
   - Render a compact **L&S (EN→LA)** card below (or above) Smith & Hall showing the top ~5–6 entries + a "See all N results" link (`&mode=en`), or cross-reference / badge lemmas that Smith & Hall already covers vs. additional L&S hits.
2. **Result row & grouping:**
   - Group by entry (Latin headword + grammar + best-matching sense breadcrumb/snippet, with `+N more senses` in a `<details>`), linking to `/dicts?q=<lemma>#<senseId>`.
   - Decide between a **single flat ranked list** vs. a **2-tier split** (_"Direct & sense-heading glosses"_ vs. a collapsed _"Also in compound phrases, quotations & notes"_ `<details>`).
3. **Ambiguous Latin/English queries (`sole`, `via`, `in`) & `lang=La`:**
   - Default to Latin headword cards first with English cards (`S&H` + `L&S Reverse`) collapsed unless `focus=En` is active; skip reverse search entirely in `lang=La` reader lookups.
