# Corpus (UI V2 & Engine) TODOs & Roadmap

Open corpus work across the Rust query engine (`corpus_rust/`), corpus builder (`src/common/library/corpus/`), and V2 web UI (`src/web/ui/corpus/`). See [`README.md`](README.md) for how the UI slice is built.

**Sizing examples.** Cost estimates below assume a theoretical corpus of **8M tokens and ~350k unique words**, a stand-in for a reasonably large library, not the size of the current build (which changes as works are added). At that size a full-corpus bitmask is 8M / 8 = 1 MB.

---

## Word-boundary rule

The corpus and the V2 reader must agree on where words start and end, because corpus word offsets become reader `matchText` highlight ranges. The rule is implemented in [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts) and documented on it.

Editorial tags (`<add>`, `<corr>`, `<hi>`, …) wrap whatever stretch of text they annotate: part of a word, a word, or several. Their edges therefore say nothing about word boundaries by themselves.

1. **Whitespace decides.** Where a tag meets text with no whitespace between, it is the same word: Pliny `ping<add>endi</add>…`, Cicero `<hi>im</hi>petu`.
2. **Two sibling tags that meet with nothing between them are a word break.** If the content were one continuous stretch, one tag would have covered it. In the source TEI the space falls between the tags: Pliny `ping<add>endi</add><add>fingendi</add>que` (the edition's own note reads _"pingendi fingendique"_), Livy `<choice>…tum…</choice><choice>…Cocles…</choice>`, Livy `<hi>se</hi><hi>habere</hi>`.
3. **Exception to 2:** if the first tag ends in `-`, it's a word hyphenated across a line break, so join: Pliny `<hi>lon-</hi><hi>gitudo</hi>`.
4. **Structure always breaks:** lines, blocks, headings, `br`, and note, gap and space markers.

**Review.** Every seam in the library at the time of the review (125 works) where the rule changes the tokens (a tag meeting text or another tag, with word characters on both sides; 9,661 seams) was checked against Morceus: is the joined form a word, the split pieces, or both? Everything ambiguous or contradicting the rule was then read by hand (checking the raw TEI where needed), and a sample of the rest. Works added since haven't been reviewed ([4.6](#46-review-tag-seams-in-works-added-since-the-word-boundary-review)).

| Seam                          | Count | Result                                                                                                                                                                                                            |
| :---------------------------- | :---- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag meets tag (rule 2: split) | 143   | 125 correct, 17 are manuscript sigla (`R²E²v`) in Pliny's main text where it doesn't matter, 1 hyphenation miss (now rule 3)                                                                                      |
| Tag meets text (rule 1: join) | 9,518 | All correct except ≈10, which are missing spaces in the source TEI ([below](#45-source-typos-missing-space-after-a-tag)). Includes 90 numeral + `vir` forms (`<num>x</num>viros`, _decemviros_), correctly joined |

**Where the rule is implemented.** No row's corpus word offsets disagree with the V2 reader's
word count: 0 of 335,585 rows across all 317 works (run the opt-in sweep in
`row_text_parity.test.ts` with `LIBRARY_PARITY_SWEEP=1` after building the library and corpus).
Keep these three in step:

- **Indexer:** [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts)
  concatenates siblings directly, relying on the source's own whitespace, and adds breaks only at
  structure and between adjacent tags (rules 2–4). Regression tests in
  `corpus_library_utils.test.ts` render fixtures through the real V2 preprocessor and client
  tokenizer.
- **Preprocessor** (`work_preprocessor.ts`): emits a space between two adjacent inline sibling
  elements that both carry text, unless the first ends in `-` or the source already has whitespace
  there (rules 2–3). Note, gap, `br`, `space` and line/block/heading/list elements get no space, so
  note markers stay flush.
- **Reader tokenizer:** the opt-in `joinAcrossInline` option in `core/text/tokenize.client.ts`, enabled
  only by the reader, tokenizes across inline styling elements (rule 1). A word that crosses an
  element becomes several `lat-word` parts sharing `data-word`, one word index and a
  `data-word-group`. The parts are plain spans (no `role`, `tabindex` or ARIA; see `createWordSpan`),
  so assistive tech reads the word once as written. The dictionary keeps per-text-node tokenizing.

V1's reader still splits words at markup, so its highlights drift in these rows. That is accepted:
V1 is frozen.

---

## Phase 2: Author & Work Scope Filtering

### Author filter beyond V1

V1 (and V2) accept one `#Author` at the start of the query. Extensions:

### 2.2 Single-work filter (`#Author/Work`)

- **Context:** Each entry in `work_lookup` ([`WorkLookupEntry`](../../../../corpus_rust/src/corpus_index.rs)) already stores `work_id`, `info` (`WorkData`), and `rows` with exact token ranges, and [`compute_range`](../../../../corpus_rust/src/corpus_query_engine.rs) already resolves an author to `[start_work_idx, end_work_idx]`. A single work is just `start_work_idx == end_work_idx`.
- **Chosen syntax:** **`#Author/Work`** (e.g. `#Cicero/de_oratore`, `#Vergil/aeneid`).
  - Matches the V2 reader URL structure (`/work/:urlAuthor/:urlName`).
  - Avoids colliding with `@keyword:value` colon error checks in [`errorsForToken`](corpus_syntax.common.ts).
  - Typing `#Cicero/` in autocomplete switches suggestions from authors to Cicero's works (using the space-free `urlName` slugs from `getV2LibrarySummaries()`, with full work titles shown as secondary labels in the dropdown).
- **Engine wire format:** Translate `#Author/Work` in `transformQuery` to `[Author/Work]` (or `[work_id]`) so the engine resolves it directly to `[work_idx, work_idx]`.

### 2.3 Multi-author and multi-work filters (Multiple `IndexRange`s)

- **Status:** Multiple authors are done in the engine. A query's `[...]` prefix may list up to 20 authors (`[Cicero, Vergil]`); [`compute_range`](../../../../corpus_rust/src/corpus_query_engine.rs) resolves each to its works' token range, and `TokenScope` sorts and merges them. Indices are sliced once over the span of all of them and `MatchIterator` drops candidates in the gaps (Option B below), so a scope never costs more than an unfiltered query. Still to do: work IDs as scope items (for 2.2), and the UI, which allows only one `#` filter ([`corpus_syntax.common.ts`](corpus_syntax.common.ts)).
- **Performance analysis (why $K$ ranges is NOT $K\times$ the cost of a query):**
  1. **Parse & metadata lookup (`convert_query_term`):** Looking up `StoredMapValue` (`offset`, `len`) for each word, lemma, or inflection tag depends only on the query terms and runs **once** per query, regardless of $K$.
  2. **Slicing indices (`IndexSlice::from`):** Slicing a `BitMask` to a range `[start, end)` is an $O(1)$ zero-copy pointer slice (`&bitmask[start_word..end_word]`). Slicing a `List` is two binary searches ($O(\log N)$, ~20 comparisons, ~100 ns).
  3. **Computing span candidates (`AND` / `OR` / break-mask / proximity):** Every operation is linear in the **length of the slice**, not the full corpus. Filtering to `#Cicero #Quintilian` (~18% + ~5% of the corpus) processes 23% of the words/elements that an unfiltered query processes. Adjacent works (e.g., all works of an author, or adjacent work ranges) also sort and merge into fewer contiguous ranges before any index work runs.
  4. **Paging & text resolution (`get_match_page` + `resolve_match_tokens`):** Stops as soon as `page_size` (50) matches are collected across ranges, so text resolution is capped at 50 matches total.
- **Implementation options in the Rust engine:**

| Approach                                                                       | Mechanism                                                                                                                                                                                                                                               | Trade-offs & Best Fit                                                                                                                                                                                                                              |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A: Per-range slice loop** (sorted, merged disjoint `Vec<IndexRange>`) | Parse query terms once; for each disjoint range $r_i$, slice indices ($O(1)$ bitmask / $O(\log N)$ list) and run `candidates_for_spans` on $r_i$. Chain the per-range `MatchIterator`s.                                                                 | **Best for 1–10 authors/works (the 99% case).** Only touches memory inside the selected authors/works, skipping 70–95% of the corpus. Runs _faster_ than an unfiltered query. Fixed per-range overhead is just ~2 binary searches per `List` term. |
| **Option B: Bounding-box range + post-filter**                                 | Set a single `IndexRange = [min(start_i), max(end_i)]` (zero changes to `candidates_for_spans`), and in `MatchIterator` skip candidate token IDs falling in the gaps between allowed `[start_i, end_i)` intervals (or AND with a cached scope bitmask). | **Best for many scattered works or sparse `List` queries.** When the final candidate set is a `List` of a few hundred token IDs, skipping out-of-range IDs in `MatchIterator` takes nanoseconds with a single pass over `candidates_for_spans`.    |
| **Option C: Hybrid**                                                           | Use Option A when `ranges.len()` is small (e.g. $\le 8$), or Option B when `ranges.len()` is large / candidate set is a `List`.                                                                                                                         | Avoids worst-case behavior in both regimes if we ever add broad category/period filters that expand to dozens of non-contiguous works.                                                                                                             |

---

## Phase 3: Query Language Enhancements & Architectural Notes

### Architectural context: Two-stage evaluation (`token_id` indices vs. per-analysis validation)

Our engine indexes `@feature → token_id` (Stage 1: set operations on `IndexSlice`) and then validates candidate tokens against their packed `u64` `LemmaAndInflection` array in [`has_matching_inflections`](../../../../corpus_rust/src/corpus_query_engine/corpus_result_resolution.rs) (Stage 2) so that a single token with multiple analyses (e.g. _amoris_ = noun gen sg of _amor_ OR verb 2nd sg pres pass ind of _amo_) doesn't false-positive on `(@lemma:amo and @case:gen)`.

- Indexing by `token_id` (rather than `analysis_id`) is the right trade-off: it keeps adjacent-token (`offset = 1`) and proximity (`~N`) math in $O(1)$ bit-shift / integer-offset space.
- However, it means Stage 1 (`corpus_index_calculation.rs`), Stage 2 (`corpus_result_resolution.rs`), and `query_pruning.rs` must agree on what a `TokenConstraint` can express.

### 3.1 Token negation (`!`) — Anchored only

- **Why unanchored `!atom` is rejected:** A standalone `!et` or `!@case:gen` matches ~99% of the corpus, materializing a dense full-corpus `BitMask` (1 MB at the theoretical 8M tokens) and forcing all span operations onto the slow full-corpus bitmask path. Every inverted-index engine requires a positive anchor.
- **Why `A and !B` is subtle on `@lemma`/`@inflection`:**
  - For `!word` inside a conjunction (e.g. `(@lemma:amo and !amor)`), `@word` is a token property, so Stage 1 set-difference (`apply_and_not`) is exact and $O(|A|)$.
  - For `!@inflection` or `!@lemma` (e.g. `(@lemma:amo and !@case:gen)`), Stage 1 **cannot** subtract `Index(@case:gen)` at the token level without dropping multi-analysis tokens like _amoris_ that have both a genitive analysis and a non-genitive analysis. Instead, Stage 1 must keep the positive anchor (`@lemma:amo`) as a conservative superset and let Stage 2 (`does_inflection_match`) check the negation per analysis.

### 3.2 Deeper parentheses (`AND` + `OR` mixed on one token)

- **Why it is currently disabled in [`query_validation.rs`](../../../../corpus_rust/src/corpus_query_engine/query_validation.rs):**
  1. `TokenValidationInfo` in [`corpus_result_resolution.rs`](../../../../corpus_rust/src/corpus_query_engine/corpus_result_resolution.rs) currently flattens a token's constraint into a **single `u32` bitmask** (`inflection: InflectionMask`) + one `is_conjunction: bool`. Allowing `((@case:gen or @case:dat) and @number:pl)` into a flat `AND` mask sets both `GEN` and `DAT` bits and requires one analysis to be both simultaneously.
  2. `is_constraint_impossible` in [`query_pruning.rs`](../../../../corpus_rust/src/corpus_query_engine/query_pruning.rs) also flattens `atoms_in(term)` and would reject `[Gen, Dat, Pl]` as conflicting cases.
  3. Evaluating an inner `(@case:nom or @case:acc)` first in Stage 1 allocates and ORs two full-corpus bitmasks before intersecting with a sparse `AND` sibling (unless normalized to DNF or `AND` is pushed down).
- **How to support it cleanly if wanted later:** Evaluate the recursive `TokenConstraint` tree (or its DNF list of `InflectionMask`s) directly against each `LemmaAndInflection` `u64` in `does_inflection_match` (~5–10 ns in registers), or support multi-value categories (`@case:gen|dat`) directly.

### 3.3 Phrase-level boolean composition (`(phrase A) or (phrase B)`, `phrase A and phrase B`)

- **What `phrase A and phrase B` means in PHI — and why we already have it:**
  - In a full-text corpus (unlike document search), "Work X contains _esse_ AND Work X contains _videtur_ 40 pages later" is useless.
  - In PHI, `A & B` is actually **bounded co-occurrence within a short passage window** (in PHI, the same page, whereas `~` is within ~100 characters).
  - In our engine, **undirected proximity between spans (`phrase A ~ phrase B` or `phrase A ~15 phrase B`) already implements this**: [`split_into_spans`](../../../../corpus_rust/src/corpus_query_engine/corpus_index_calculation.rs) splits a query at every `~` into contiguous multi-word spans (`SpanResult`), and `combine_span_candidates` finds passages where all spans co-occur within $N$ words in either direction. For example, `esse videtur ~5 causa` already means "the phrase _esse videtur_ and _causa_ within 5 words of each other in either order."
  - **Conclusion on phrase-level `AND`:** We don't need a separate phrase-level `and` operator — `~` between multi-word spans already _is_ passage-level `AND` with explicit distance control.
- **What `(phrase A) or (phrase B)` means — and how it pops out via top-level DNF:**
  - Single-token `or` stays inside `TokenConstraint`. Multi-token `(phrase A) or (phrase B)` (e.g. `(senatus populusque Romanus) or (patres conscripti)`, where the branches can even have different token lengths) is a disjunction across multi-token sequences.
  - **Implementation via top-level DNF + $k$-way merge:**
    1. Distribute phrase-level `or` over concatenation and `~` at parse time into $k$ standard `OR`-free `Query` branches (e.g. `((senatus populusque) or (patres conscripti)) ~5 decrevit` $\rightarrow$ `["senatus populusque ~5 decrevit", "patres conscripti ~5 decrevit"]`, capped at e.g. $k \le 8$).
    2. Each branch runs through the existing span/bitmask engine **completely unchanged** (preserving exact per-branch span lengths for `filter_breaks` and highlight resolution).
    3. Merge the $k$ resulting match streams in `(start_token_id, end_token_id)` order when collecting the page.

### 3.4 Prefix / suffix matching (`am*`, `*or`, `am*or`)

- **Context:** PHI searches raw character strings with `#` for word boundaries; our engine indexes whole tokens and lemmata (~350k unique words at the theoretical 8M tokens).
- **Syntax & guardrails:**
  - Allow `*` on bare word atoms: prefix (`bell*`), suffix (`*tio`), or prefix+suffix (`in*bilis`).
  - Require at least 2–3 literal ASCII letters alongside `*` in `errorsForToken` (`"wildcard terms must have at least 2 letters"`).
- **Step 1 — Vocabulary lookup (matching unique word IDs in `id_table["word"]`):**
  - Neither option requires changing the serialized corpus format on disk:
    - **Option A (Zero-index linear scan):** Scan `id_table["word"]` keys with `starts_with` / `ends_with`. Takes **~2 ms** in Rust for ~350k words (measured at ~1–1.5 ms for 205k), **0 extra RAM**, and trivially supports `am*`, `*or`, `am*or`, and even `*mor*`.
    - **Option B (Two sorted arrays built at `CorpusQueryEngine::new` init):** Build `forward_vocab` (sorted lexicographically) and `reverse_vocab` (sorted by reversed chars) once at engine startup (~100 ms, ~7 MB RAM for ~350k words). Prefix and suffix lookups become $O(\log V + M)$ binary-search `partition_point` slices (**~200 ns**).
- **Step 2 — Single-pass union of the $M$ matched word indices (avoiding pairwise AST `OR`):**
  - Do **not** rewrite `bell*` into a syntactic `(w1 or w2 or ... or wM)` `TokenConstraint::Composed` node, which would fold `apply_or_to_indices` $M$ times and reallocate/copy `Vec<u32>` $O(M^2)$ times.
  - Instead, add `TokenConstraintAtom::Affix` (or `Wildcard`) and merge the $M$ `IndexSlice`s in a **single pass** inside `index_for_atom(range)`:
    1. Slice each of the $M$ word indices to `range` (`IndexSlice::from`) and sum their lengths into `total_hits`.
    2. **Fast Path 1 — `BitMask` accumulator (when `total_hits > 4096` or any matched word is a `BitMask`):**
       Allocate **one** zeroed `Vec<u64>` of length `(range.end - range.start) / 64` (at most 1 MB, for the whole theoretical 8M-token corpus; smaller for author/work ranges). Set the bits for each `List` slice (`mask[(id - range.start) / 64] |= 1 << (bit % 64)`) and bitwise-OR any `BitMask` slice in place. Runs in **< 0.5 ms** with a single allocation even if a pattern matches 400k tokens.
    3. **Fast Path 2 — Merging $M$ pre-sorted `List` slices (when `total_hits <= 4096` and all slices are `List`s):**
       Each of the $M$ slices is already sorted and disjoint, so we can merge them in $O(N \log M)$ rather than $O(N \log N)$ — either via a $k$-way merge / balanced pairwise merge of the slices, or by appending the $M$ ascending runs into `Vec::with_capacity(total_hits)` and calling Rust's run-aware `vec.sort()` (`driftsort`, which detects existing sorted runs and merges them in $O(N \log M)$) or `sort_unstable()` (~10–20 µs for $\le 4096$ `u32`s). Keeping the result as a `List` when `total_hits <= 4096` keeps downstream intersections on the fast `List` path.
- **Step 3 — Stage 2 (`has_matching_inflections`) needs zero changes:**
  - Because each token has only one surface word string, `Affix` is exact at Stage 1 (just like `TokenConstraintAtom::Word`) and needs no per-analysis validation in `does_inflection_match` — even when combined with an inflection filter like `(bell* and @case:abl)`.

---

## Phase 4: Concordance Mode, Pagination, UI & Indexer Polish

### 4.1 Concordance (KWIC — Key Word in Context) mode

- **Goal:** Provide a classic PHI-style concordance view where each match is a single compact row with the matched word/phrase vertically aligned down the center of the page, flanked by right-aligned left context, left-aligned right context, and a compact citation column (`Author, Work 1.2`).
- **Why it needs zero Rust engine changes:**
  - [`resolve_text_ranges`](../../../../corpus_rust/src/corpus_query_engine/corpus_result_resolution.rs) already returns `match.text` as `Array<[text: string, isCoreMatch: boolean]>`, and [`CorpusResultView`](corpus_query.server.ts) exposes it directly as `snippet`.
  - Everything before the first `isCoreMatch === true` chunk is the **left context**; everything from the first `true` chunk through the last `true` chunk is the **pivot** (supporting both single-span and multi-span `~` matches); everything after the last `true` chunk is the **right context**.
- **UI & URL implementation:**
  - Purely a UI setting in [`corpus_params.common.ts`](corpus_params.common.ts) (e.g. `concordance=1` or `view=kwic` alongside `pageSize`, `contextLen`, and `strictMode`).
  - In [`corpus_view.server.ts`](corpus_view.server.ts), render a compact 4-column KWIC row (`citation | right-aligned left wing | centered match | left-aligned right wing`) instead of multi-line snippet cards.

### Previous page

V1 showed a Back button that was always disabled ("Back doesn't work yet"); V2 has only a Next link and relies on browser Back. The engine pages forward only: a cursor (`resultId-resultIndex-candidateIndex`) says where the _next_ page starts, and nothing computes the one before it. Options:

| Option                                             | Pros                                                                                                         | Cons                                                                                                               |
| :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| Cursor trail in the URL (`prev=c1.c2.c3`)          | A real Previous link, even on shared links. Stateless. Adds to the current URL contract without changing it. | URL grows ~15 chars per page. A cap (e.g. last 10) limits how far back it goes. The same page gets different URLs. |
| Server-side cursor cache (`page=N`, LRU per query) | Clean URLs, numbered pages.                                                                                  | Server state. A miss re-runs N forward queries, and `runQuery` blocks the event loop.                              |
| Engine support (reverse cursors or offsets)        | Best UX: Previous, page numbers, jump to page.                                                               | Rust work.                                                                                                         |

A "First page" link is a cheap first step if the others wait.

### 4.3 Author discovery without JS

- **Current state:** Only JS autocomplete lists the available `#Author` names.
- **Fix:** Add an expandable `<details>` list of authors (or clickable examples) in [`corpus_help.server.ts`](corpus_help.server.ts), matching the existing "All inflection @categories" disclosure. (Considered alternative: a native `author=` checkbox list in the form, which works without JS and handles spaces, but gives the same filter two sources of truth next to `#Author`.)

### 4.4 Heading rows cannot be highlighted

Non-leaf rows (e.g. a chapter heading row `1.2` above sections `1.2.1…`) are indexed by the corpus but rendered by V2 without an `id` (1,359 rows library-wide). A `matchText` range that falls in such a row resolves the right page but highlights nothing. Low priority; fixing it needs a stable per-row identifier (e.g. `data-row-id`) on every rendered section.

### 4.5 Source typos: missing space after a tag

**Status:** Open, low priority. In these rows the source TEI has no space after a tag, so rule 1 joins two words. No markup-based rule can tell; they need a text fix, probably through the per-work `patches` hook in `process_library.ts` (not yet checked). One fix corrects both the corpus and the reader.

| Work                                                      | Section           | Raw TEI                                                               | Should be                                        |
| :-------------------------------------------------------- | :---------------- | :-------------------------------------------------------------------- | :----------------------------------------------- |
| `phi1014.phi001.perseus-lat1` (Seneca Elder)              | 2.1.14            | `<add>O</add>me abdicandum`                                           | _O me_                                           |
| `phi1014.phi001.perseus-lat1`                             | 2.5.10            | `…in hac</add>controuersia`                                           | _hac controuersia_                               |
| `phi1014.phi001.perseus-lat1`                             | 2.2.10            | `tu‖uis facturi` ¹                                                    | _tu uis_                                         |
| `phi1014.phi001.perseus-lat1`                             | 2.5.16            | `quid‖si tyrannus` ¹                                                  | _quid si_                                        |
| `phi1014.phi001.perseus-lat1`                             | 10.pr.9           | `Nunc‖autem` ¹                                                        | _Nunc autem_                                     |
| `phi0474.phi011.perseus-lat2` (Cicero, _De Lege Agraria_) | 2.4               | `<reg>est</reg>illud amplissimum`                                     | _est illud_                                      |
| `phi0474.phi039.perseus-lat1` (Cicero)                    | 168               | `<hi rend="italics">is</hi>qui` (the edition's note reads _"is qui"_) | _is qui_                                         |
| `phi0978.phi001.perseus-lat2` (Pliny)                     | 2.108             | `‾LXXXIX‾‾XLV‾efficit` (`‾` = overline tag)                           | _XLV efficit_                                    |
| `phi0978.phi001.perseus-lat2`                             | 19.3              | `per ‾IIII‾stadium`                                                   | _IIII stadium_                                   |
| `phi0978.phi001.perseus-lat2`                             | 9.21, 27.13, 30.1 | `an‖t`, `a‖dVI`, `ill‖ut`                                             | Unclear: apparatus fragments or gaps in the text |

¹ Seam taken from the processed work; the raw TEI wasn't checked.

**How to find more.** List every seam where a tag meets text and the characters on both sides are word characters (not `isTextBreakChar`, not whitespace). Keep the ones where Morceus (`MorceusCruncher`) recognizes both split pieces but not the joined form. Drop numeral + `vir` forms and Pliny's Greek names and plant names (the analyzer doesn't know them). This gave 189 candidates, and the rows above are what survived reading them.

### 4.6 Review tag seams in works added since the word-boundary review

**Status:** Open, low priority. The [seam review](#word-boundary-rule) covered the 125 works in the library at the time. The row-parity sweep now passes on the full library (317 works), so the corpus and the reader agree on word boundaries everywhere; what hasn't been checked for the newer works (mostly thelatinlibrary, with its own markup) is whether those shared boundaries are right, i.e. source typos like those in [4.5](#45-source-typos-missing-space-after-a-tag).

Re-run the seam review on the new works only, using the method in 4.5 ("How to find more"), and add any source typos to that table.
