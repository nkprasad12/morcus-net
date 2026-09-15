# Dictionary TODOs (`src/web/v2/dict/`)

Known follow-up work for this topic. See [`README.md`](README.md) for how the
directory is organised and [`FEATURE_PARITY.md`](FEATURE_PARITY.md) for the V1 → V2
gap analysis.

---

## 1. Cache rendered entry bodies

**Status:** not started. Analysed and benchmarked; the design below is ready to build.

### Motivation

`xmlNodeToHtml` is the expensive part of serving a dictionary result, and it re-runs
from scratch on every request for the same entry. Measured over 200 iterations against
real L&S entries:

| Entry                  | HTML size | Full `xmlNodeToHtml` |
| :--------------------- | --------: | -------------------: |
| `n38913` (_proximus_)  |   60.6 KB |         **7.637 ms** |
| `n30954` (_nihilum_)   |   48.1 KB |             5.318 ms |
| `n19246` (_gallus_)    |   15.4 KB |             1.597 ms |
| `n33435` (_palatinus_) |   12.3 KB |             1.093 ms |
| `n36` (_abbas_)        |    1.4 KB |             0.154 ms |

Popular long entries cost several milliseconds of pure CPU per request, every request.

### What is and isn't cacheable

`renderEntryResult` in [`entry_view.server.ts`](entry_view.server.ts) emits three fragments:

| Fragment                                   | Depends on                              | Cacheable per entry?                                             |
| :----------------------------------------- | :-------------------------------------- | :--------------------------------------------------------------- |
| Tools bar (headword, Outline, Inflections) | `result.outline`, `result.inflections`  | ❌ `result.inflections` is the morphology of the _searched form_ |
| Subsection banner                          | which subsections matched               | ❌ inherently per-query                                          |
| **Entry body** (`xmlNodeToHtml`)           | `result.entry` + `matchedSubsectionIds` | ✅ **this is the one worth caching**                             |

> [!NOTE]
> The tools bar was never cacheable per-entry, so any pre-render scheme was always
> going to be fragment-level rather than whole-entry-level. The body has exactly one
> query-dependent input — `matchedSubsectionIds` — and its entire effect is adding
> `class="subsection-hit"` and `aria-current="location"` to a handful of elements.
>
> `allowLinkify`, the other option on `XmlNodeToHtmlOptions`, is never passed by any
> caller; it is only set internally during recursion. So `result.entry` really is the
> sole content input.

### Shape

Cache the body keyed on entry id, then splice the per-query markers in:

```ts
// Cached per entry id — independent of the query.
const body =
  cache.get(id) ?? cache.set(id, xmlNodeToHtml(entry, { omitRootId: true }));

// Per request: a handful of ids, resolved by resolveSubsectionAnchor().
const marked = markSubsectionHits(body, matchedAnchorIds(groups));
```

Splicing is far cheaper than re-rendering — **0.26 ms vs 15.80 ms** across the five
entries above, a 62× saving. The marker step costs roughly 1.3% of the render it
replaces, so it does not undermine the win.

### Blocked on: always emit a `class` attribute alongside `id`

> [!WARNING]
> A naive splice is silently broken. The generator template at
> [`xml_to_html.server.ts:L268`](xml_to_html.server.ts) is
> `` `<${tagName}${idAttr}${classNames}…>` ``, so `class` always immediately follows
> `id`. Inserting ` class="subsection-hit"` after `id="X"` on an element that
> **already has a class** produces a duplicate `class` attribute. Browsers keep the
> first one, so the marker never appears — with no error anywhere.

Fix before building the cache: make the generator always emit a `class` attribute when
an `id` is present, even if empty. Today `classNames` is omitted entirely when the node
has no class:

```ts
// xml_to_html.server.ts, ~L233
const finalClass = attrsMap.get("class");
const classNames = finalClass ? ` class="${he.escape(finalClass)}"` : "";
```

With that guaranteed, the splice becomes one unconditional
`indexOf('id="X" class="')` plus an insert — no branching, no regex over the HTML.

### Rejected alternatives

| Approach                                              | Why not                                                                                                                             |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| Per-page `<style>` block targeting `#n38913\.14` etc. | Leaves the body 100% cacheable, but cannot set `aria-current`, so it is an a11y regression. Also adds inline CSS to every response. |
| Render placeholder tokens, then string-replace        | Same cost as splicing, but bloats every cached entry with tokens for ids that are almost never matched.                             |
| Mark matched subsections client-side                  | Breaks the zero-JS baseline. Non-starter — see [`../README.md`](../README.md).                                                      |

### Sizing caveat

The cache holds rendered HTML, which is larger than the source XML — _proximus_ alone
is 60.6 KB. L&S has ~51k entries, so an exhaustive build-time pre-render is on the
order of hundreds of MB. An LRU over hot entries is probably the right call; that
sizing exercise is still open.

---

## 2. Fix the dead-anchor bug in V1

**Status:** not started. Low priority — only worth doing while V1 is still user-facing.

V2 works around this in `resolveSubsectionAnchor`
([`subsection_note.server.ts`](subsection_note.server.ts)), but V1's `SubsectionNote` in
`src/web/client/pages/dictionary/dictionary_v2.tsx` has the same latent bug and no
workaround.

When an L&S entry has a single level-1 sense, `displayEntryFree`
(`src/common/lewis_and_short/ls_display.ts`) merges it into the opening blurb and never
emits the corresponding `<li id="nXXXX.0">` — but `derivedOrths`
(`src/common/lewis_and_short/ls_orths.ts`) still records `senseId = nXXXX.0`. Roughly
30% of sampled subsection anchors pointed at nothing.

The fix V2 uses: fall back to `{entryId}.blurb`, then to the entry root. That resolved
every measured case (`.0` bucket: 8 direct + 32 via blurb + 0 unresolved).

---

## 3. Sanitize or render markup in Smith & Hall `mainLabel`

**Status:** resolved (runtime sanitization complete; build-time extraction pending).

### Bug Description

In Smith & Hall entries such as `sh7671` (_dog_, reachable at `/v2/dicts/id/sh7671`), the entry header title renders with escaped, literal HTML tags:

```
dog (<i>subs.</i>)
```

The browser displays raw text `dog (<i>subs.</i>)` rather than italicized text `dog (`_subs._`)` or plain text `dog (subs.)`.

### Cause

1. `findShLabelText` in [`src/common/smith_and_hall/sh_outline.ts`](../../../common/smith_and_hall/sh_outline.ts) extracts text from `entry.blurb` starting after `<b>${key}</b>` up to `)`:
   ```ts
   return `${key} ${blurb.substring(i, j + 1)}`;
   ```
   The source blurb contains raw HTML fragments like `(<i>subs.</i>)`.
2. `renderEntryResult` in [`entry_view.server.ts`](entry_view.server.ts) selects `result.outline.mainLabel` as `headword`, and runs `he.escape(headword)`:
   ```html
   <span class="entry-headword-text">${he.escape(headword)}</span>
   ```
   This converts `<` and `>` into `&lt;` and `&gt;`, causing the browser to render the raw HTML tag text on screen.

### Fix Implemented (Runtime Tier)

- **Runtime Revival Sanitization (`src/common/smith_and_hall/sh_dict.ts`)**:
  Sanitizes `outline.mainLabel`, `outline.mainSection.text`, and `outline.senses[].text` upon JSON deserialization in `reviveRaw`, stripping inline HTML tags before handing entries to callers. This guarantees backwards compatibility with existing `sh.db` databases without forcing an immediate artifact rebuild.
- **Defensive Rendering Sanitization (`src/web/v2/dict/entry_view.server.ts` & `dict_page.server.ts`)**:
  Strips HTML tags from `headword` before `he.escape()` defensively across entry headers and multi-entry quick-jump bars.

### Pending TODO (Build-Time / Extraction Tier)

- [ ] **Build-time / Extraction tier**: Fix `src/common/smith_and_hall/sh_outline.ts` (`getOutline`, `findShLabelText`, and `chooseOutlineText`) so future database builds (`./morcus.sh build -b_sh`) generate pure plaintext `mainLabel` and outline text directly at the source (stripping inline HTML tags like `<i>...</i>`) without relying on runtime sanitization in `sh_dict.ts`.

---

## 4. Riddle & Arnold headword casing mismatch (`dog` vs `DOG`)

**Status:** not started.

### Bug Description

In Riddle & Arnold entries such as `ra_dog` (reachable at `/v2/dicts/id/ra_dog`), the header renders in lowercase `dog` while the entry body immediately underneath begins with uppercase `DOG`:

```
dog   [🔗 Copy link]
• DOG
1. s. canis...
```

### Cause

1. `process_riddle_arnold.ts` ([`src/common/dictionaries/riddle_arnold/process_riddle_arnold.ts`](../../../common/dictionaries/riddle_arnold/process_riddle_arnold.ts)) formats R&A entries from tab-separated lines where `header` is uppercase (`"DOG"`). When creating the outline:
   ```ts
   const outline: EntryOutline = {
     mainKey: keys[0], // keys = header.split(",").map(k => k.trim().toLowerCase()) -> "dog"
     mainSection: { text: header, level: 0, ordinal: "0", sectionId: id }, // "DOG"
   };
   ```
2. In `renderEntryResult` ([`entry_view.server.ts`](entry_view.server.ts)), the headword resolution hierarchy is:
   ```ts
   const headword =
     result.outline?.mainLabel?.trim() ||
     result.outline?.mainKey?.trim() ||
     result.outline?.mainSection?.text?.trim() ||
     ...
   ```
   Since `mainKey` (`"dog"`) is checked before `mainSection.text` (`"DOG"`), the lowercase search key wins and is displayed as the editorial headword.

### Proposed Solutions

- **Option A (Outline generation)**: Store the formatted display title in `outline.mainLabel` (e.g. `mainLabel: header`) during R&A processing, matching dictionaries like Forcellini.
- **Option B (Headword resolution)**: Prefer `mainSection.text` when it represents an explicit title, or adjust the precedence in `entry_view.server.ts` when `mainKey` is merely a normalized lowercase index key.

---

## 5. Pre-compute and statically serve 2-letter autocomplete chunks

**Status:** not started. Benchmarked and designed; see `completion_chunk_cache_implementation_plan.md`.

### Motivation

Currently, `/v2/api/completions?prefix=am` queries the SQLite databases dynamically per request. While fast (~5–10 ms), Latin headword data is completely static and only changes when rebuilding the corpus.

Benchmarking across the entire corpus reveals:

- Exactly **371 non-empty 2-letter combinations** exist across all active dictionaries.
- When stored as a dictionary map (`{ "L&S": string[], "GAF": string[], ... }`), the **total compressed size for all 371 files across the entire website is only ~550 KB** (median file is ~1.2 KB Brotli).
- Grouping all dictionaries into a single payload yields **45% better compression** than separate per-dictionary files because Brotli deduplicates shared Latin stems across lexicons.

### Proposed Architecture

1. **Build Step (`./morcus.sh build`)**:
   - Query all dictionary SQLite tables once at build time.
   - For each 2-letter prefix, write `build/completions/:commitId/:prefix.json`.
   - Pre-compress each file to `.json.br` (q=11) and `.json.gz` (level 9).
2. **Server Serving**:
   - Serve directly from disk via static middleware (`sendfile` / `express.static`) with:
     ```http
     Cache-Control: public, max-age=31536000, immutable
     ```
   - Zero SQLite queries, zero Node event-loop blocking, zero CPU compression overhead.
3. **Client**:
   - Consumes the pre-computed static files directly without code changes, since the client already expects `Record<string, string[]>`.

---

## 6. Per-entry collapsible headers

**Status:** not started. Ergonomic enhancement (not a V1 parity issue).

### Motivation & Design

Make individual entry headers/headwords collapsible via the decoupled `<details class="entry-toggle">` pattern, mirroring dictionary card collapse.

- Add a `.entry` case to `expandAncestorDisclosures` in `v2_bundle.client.ts` so anchor deep-links automatically expand collapsed entries.
- Improves scanability on results with multiple long entries inside the same lexicon.

---

## 7. Table of Contents scroll tracking (Scroll-Spy)

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
