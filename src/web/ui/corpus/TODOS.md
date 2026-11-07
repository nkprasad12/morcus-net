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

### 3.4 Prefix / suffix matching (`con*`, `*que`, `in*bilis`)

**Status:** Designed and prototyped; not wired in. Choose option B (sorted word IDs) below. The prototype is [`sorted_vocab.rs`](../../../../corpus_rust/src/sorted_vocab.rs), and [`examples/vocab_proto.rs`](../../../../corpus_rust/examples/vocab_proto.rs) produced every number in this section (`cargo run --release -p corpus --example vocab_proto -- [--cold]`, from the repo root after building the corpus).

> [!NOTE]
> Both files are unreviewed prototypes, kept so the numbers can be reproduced. When this work concludes, review them properly (folding `SortedVocab` into the real implementation) or delete them.

**Measured on the current build, not the 8M-token sizing example:** 6.47M tokens and 297k unique words (2.76 MB of text, 9.3 bytes on average), on a 24-vCPU EPYC 7B12 cloudtop. Costs scale roughly linearly with vocabulary size and with hits.

#### What a wildcard costs: find the words, then merge their lists

A wildcard term runs in two steps:

1. **Find the words.** List every word in the vocabulary that matches the pattern. `in*` matches 15.7k words.
2. **Merge their lists.** Each word has a sorted list of the token positions where it occurs (`servum` → `[1, 19, 3480, …]`, in `latin_corpus_buffers.bin`). The rest of the engine (span matching, proximity, scope filtering) expects one set of positions per term, so the matched words' lists are unioned into one bitmask: one bit per token in the query's range, so ~790 KB for the whole corpus (1 MB at the 8M-token example). The bitmask goes into the existing pipeline the way a dense index like `@case:abl` does today.

The merge costs time in proportion to **hits** (positions set), not to the number of matched words. A dense term is nothing new for the engine (`@case:abl` is far denser than any allowed wildcard). The new costs are finding the words and the merge itself.

#### Options for finding the words

- **Option A (rejected): scan `id_table["word"]`.** Test every key with `starts_with` / `ends_with`. No new data, and it handles `*mor*`. But the word table is a `HashMap<String, u32>` whose keys are separate heap strings, so the scan jumps around memory. It measured **3.4–6.6 ms warm and 10–13 ms with cold caches**, all of it blocking Node's event loop, since `runQuery` is synchronous. (An earlier estimate of "~1–1.5 ms for 205k words" was never measured, and doesn't hold.) Scanning a contiguous copy of the words halves the warm cost (1.7–3.0 ms), at ~5 MB of extra RAM.
- **Option B (chosen): number words in sorted order.** The word ID is used for one thing only: indexing `indices["word"]` (`get_str_keyed_metadata("word", …)` in `corpus_index_calculation.rs`). No per-token data stores word IDs, and the packed inflection data holds lemma IDs, not word IDs. So if the build assigns word IDs in sorted byte order, a sorted array of the words _is_ the ID table: a word's position in it is its ID.
  - **Exact lookup** becomes a binary search (about 18 comparisons for 297k words).
  - **`prefix*`** becomes a contiguous ID range, found with two binary searches.
  - **`*suffix`** uses one more array, `by_suffix`: the word IDs sorted by reversed spelling, so words ending in the same letters are adjacent. Comparisons are on UTF-8 bytes, so a byte suffix match is also a character suffix match.
  - **`prefix*suffix`** takes the prefix range and filters it with `ends_with`.
  - Because the build writes word lists in ID order, **the lists for a prefix match sit back to back in the buffer file**, so the merge reads one contiguous stretch rather than jumping around.

#### Option B: memory and startup (measured)

|                     | Today (`HashMap<String, u32>` in the JSON)                                | Option B (sorted vocabulary file, memory-mapped)                                              |
| :------------------ | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| Word table in RAM   | **26.8 MB** malloc-reserved (20.1 MB requested), per Node process         | **5.14 MB**: 2.76 MB of packed text + 1.19 MB of offsets + 1.19 MB `by_suffix`                |
| Kind of memory      | Ordinary heap memory. Can't be evicted, and `prod` and `dev` each pay it. | Page cache. Evictable, and shared between containers whose images have the same corpus layer. |
| `latin_corpus.json` | 24.6 MB; parse ~228 ms; live heap 63.7 MB; RSS +58.6 MB                   | 19.0 MB without the word table; parse ~119 ms; live heap 36.9 MB; RSS +31.7 MB                |

So option B **saves ~22 MB of heap per process and ~110 ms of parsing at startup**, before counting the ~5 MB file it maps. The prototype builds the sorted array at load time (~155 ms); the real version writes it at corpus build time, so startup pays nothing for it.

#### Option B: query time (measured)

"Cold" means that before each timed run, the benchmark reads a 64 MB buffer (4× the core's 16 MB L3) to evict L1/L2/L3 and the TLB, with the process pinned to one core. That is the pessimistic case of a one-off query arriving between unrelated Node work. Page cache stays warm: the engine maps its files with `MAP_POPULATE`, and prod has 8 GB of RAM against ~215 MB of corpus files, so they stay resident. Whatever a real query already has in hand (its own text, the IDs the previous step produced) is touched after evicting. Medians are shown; p90 is within ~10% throughout.

**Exact lookup** (one word, 2000 samples; uniform and frequency-weighted query words gave the same results):

|                                                    | `HashMap` (today) |        Binary search (B) |
| :------------------------------------------------- | ----------------: | -----------------------: |
| Warm-ish (random words, no eviction): median / p99 |     0.47 / 1.1 µs |            0.71 / 2.3 µs |
| Cold: median / p99                                 |      2.8 / 4.0 µs |            6.5 / 11.5 µs |
| Comparisons                                        |                 — | 18.2 average, 19 at most |

Cold, binary search is ~2.3× slower, about +4 µs per word in the query, likely from TLB misses (each probe touches a different 4 KB page). Against queries that take milliseconds this doesn't matter. If it ever does, a small table keyed on the first two letters would roughly halve the probes.

**Wildcards, cold** (40 one-shot runs, ms, median):

| Pattern    | Words | Hits | A: find (scan) | A: merge (scattered) | **A total** | B: find (sorted) | B: merge (contiguous) | **B total** |
| :--------- | ----: | ---: | -------------: | -------------------: | ----------: | ---------------: | --------------------: | ----------: |
| `bell*`    |   209 |  10k |           11.2 |                 0.18 |    **11.4** |            0.016 |                  0.09 |    **0.10** |
| `am*`      |  1.9k |  25k |           11.3 |                 0.60 |    **11.9** |            0.033 |                  0.15 |    **0.19** |
| `con*`     | 10.6k | 107k |           10.9 |                 2.32 |    **13.1** |             0.11 |                  0.40 |    **0.51** |
| `in*`      | 15.7k | 275k |           11.4 |                 3.28 |    **14.6** |             0.15 |                  0.77 |    **0.92** |
| `*tio`     |  1.3k |  25k |           13.5 |                 0.47 |    **13.9** |            0.018 |                  0.34 |    **0.36** |
| `*que`     | 27.8k | 171k |           13.2 |                 3.56 |    **16.9** |            0.035 |                  2.83 |    **2.87** |
| `in*bilis` |    78 |  446 |           10.0 |                 0.10 |    **10.1** |             0.13 |                  0.07 |    **0.20** |

- **Finding the words** drops from 10–13 ms to at most 0.15 ms. The prefix cases take that long only because the prototype copies the matched IDs into a list; the range itself costs two binary searches.
- **Contiguous lists make prefix merges 3–6× faster cold** (`con*` 2.32 → 0.40 ms) and ~2× warm. Warm, I checked this with the buffers copied into the heap, to rule out mmap effects. Suffix matches aren't contiguous in sorted order, so they gain only ~1.1–1.3×.
- **Counting hits** (summing the matched words' list lengths) takes ≤ 0.04 ms, cheap enough to check the budget below before allocating anything.
- **B's worst case today is ~3 ms** (`*que`), against 10–17 ms for A.

#### Which patterns to allow

Hits for every 2–4 letter prefix and suffix in the current build:

| Fixed letters | Patterns over 100k hits  | Worst cases                                                                                                |
| :------------ | :----------------------- | :--------------------------------------------------------------------------------------------------------- |
| 2             | 15 prefixes, 17 suffixes | `*um` 516k (8% of the corpus), `*us` 402k, `qu*` 362k, `in*` 275k (123k of which are the word _in_ itself) |
| 3             | 3 prefixes, 3 suffixes   | `*que` 171k, `qui*` 126k, `qua*` 124k, `*tur` 111k                                                         |
| 4             | none                     | `*ibus` 86k, `quae*` 48k                                                                                   |

Rules, checked in the engine (`query_validation.rs`) and mirrored in `errorsForToken` so the autocomplete reports them while typing:

1. **At least 3 fixed letters** in the pattern (`con*`, `*que`, `in*bilis`). Easy to explain; rejects `in*`, `*um` and `qu*`, which return nothing useful; caps today's worst case at ~171k hits.
2. **A hit budget per query, checked before merging:** reject when the wildcard terms' hits add up to more than ~200k (~3% of the corpus), with a message like "`*xyz` matches too many words; add letters". Nothing with 3+ letters reaches it today. It holds the line as the corpus grows, and covers queries with several wildcard terms.
3. **One `*` per term**: at the start, at the end, or once in the middle (`in*bilis`). No `*mor*`: matching inside words needs a scan, which option B doesn't speed up. Revisit if anyone asks; a scan over the packed vocabulary costs ~2–3 ms.
4. **At most 2–3 wildcard terms per query**, sharing the hit budget, including inside `or` groups (`(am* or bell*)`).
5. **Words only for now.** `@lemma:am*` needs lemma IDs renumbered too, and lemma IDs are stored in the packed inflection data, so that's a bigger build change. Inflection values (`@case:…`) don't need wildcards.
6. **Normalize, then check:** lowercase the pattern (word keys are stored lowercase), and reject `*` on its own and non-letters around the `*`. A pattern that matches no words is an error ("no word matches `xyz*`"), not an empty search.

#### Implementation plan

1. **Build (TS, `build_corpus.ts` / `corpus_serialization.ts`).**
   - After collecting the corpus, renumber word IDs in sorted order, and permute `indices["word"]` to match before writing the buffers. Lists are written in ID order, so this alone makes prefix matches contiguous.
   - Sort by UTF-8 bytes (`Buffer.compare`), not JavaScript's default UTF-16 order, so the order matches Rust's `[u8]` comparisons.
   - Write `latin_corpus_vocab.bin`: a word count, then `offsets: u32[V + 1]`, then `by_suffix: u32[V]`, then the packed text. Drop `idTable.word` from `latin_corpus.json`; keep `lemma` and `breaks`.
   - `stats.uniqueWords` (`indices.word.length`) is unchanged. Nothing else in TS reads `idTable.word`.
   - The Rust builder (`build_corpus_v2`) must make the same change when it stops being a stub.
2. **Engine load.** Map the vocabulary file with the existing `byte_reader` (populated mmap). Make `SortedVocab` borrow its three arrays from the mapping, not own `Vec`s as the prototype does. Replace the `id_table["word"]` lookup in `get_metadata_for` with `vocab.lookup(&word.to_lowercase())`.
3. **Query language.** Add `TokenConstraintAtom::Affix { prefix, suffix }`, parsed in `query_parsing_v2.rs`, and the rules above in `query_validation.rs`.
4. **Index calculation.** In `index_for_atom`, resolve the matched IDs, check the hit budget, then union the lists in one pass, never by folding `apply_or_to_indices` M times (that reallocates and copies O(M²)):
   - **Over 4096 hits:** allocate one zeroed bitmask over the query's range, set bits from each list, and OR in any list stored as a bitmask (none in the current build: no word reaches the bitmask threshold).
   - **4096 hits or fewer:** append the M sorted lists into one `Vec` and sort it (Rust's run-aware sort merges sorted runs in O(N log M)), and return a `List`, so later intersections stay on the fast list path.
   - **With a scope** (`[Caesar] con*`): slice each list to the range (`IndexSlice::from`) before merging. Prefix lists are still contiguous.
5. **Stage 2 (`has_matching_inflections`) needs no changes.** A token has one spelling, so `Affix` is exact at Stage 1, like `Word`, even inside `(bell* and @case:abl)`.
6. **UI.** Add the syntax to `corpus_help.server.ts`. In the autocomplete, explain a wildcard as "words starting with `con`" and surface rule violations as errors. A later option: a prefix endpoint over the sorted vocabulary for bare-word completions and match counts ("`bell*`: 209 forms").

### 3.5 Pool bitmask buffers (measure first)

**Status:** Idea, not measured. Every dense intermediate (a merge, an AND of two bitmasks, a proximity shift) allocates a fresh `Vec<u64>` of up to ~790 KB (1 MB at the 8M-token example). A small pool of reusable buffers would skip the allocation.

**Expected gain is modest; profile first.** glibc already behaves like a pool once warm. The first allocation of that size is served by `mmap`, but freeing it raises glibc's mmap threshold, so later allocations of that size come from the heap's free lists. A pool would mainly save the ~190 first-touch page faults per fresh buffer, plus the zeroing (`memset`, ~20–40 µs) on buffers an operation overwrites completely anyway. Probably tens to low hundreds of µs per bitmask-heavy query. Profile a dense query (for example `@case:abl @case:abl ~ @case:acc`) for time spent allocating before building this. Switching the allocator to mimalloc, which caches freed pages, is a one-line alternative to compare against.

**How to do it without fighting lifetimes:**

- **The problem with handing out references.** Lending `&'p mut [u64]` from a pool needs `&mut pool` for each loan, so two bitmasks in use at once are two mutable borrows of the pool, which the borrow checker rejects. And `query_corpus` takes `&self`, so a pool inside the engine can't be borrowed mutably at all.
- **Hand out ownership instead.** `BitmaskPool { free: Mutex<Vec<Vec<u64>>> }` lives in `CorpusQueryEngine`. An uncontended `Mutex` costs ~20 ns; `RefCell` works if the engine never crosses threads. `take(len)` pops a `Vec` (or allocates one) and returns it by value inside a guard, `PooledBitmask<'a> { buf: Vec<u64>, pool: &'a BitmaskPool }`. The guard's `Drop` pushes the `Vec` back, and it derefs to `&[u64]` / `&mut [u64]`.
- **No new lifetime.** `IndexSlice<'a>` already borrows from the engine for `'a` (its `Ref` variant points into the memory-mapped buffers), and the pool lives in the same engine. So `IndexDataOwned::BitMask(Vec<u64>)` becomes `BitMask(PooledBitmask<'a>)` under the existing `'a`. Two buffers in use are just two separate owned `Vec`s, with no overlapping borrows. To avoid even the extra field, an `Arc<BitmaskPool>` handle in the guard removes the lifetime, at the cost of one refcount bump per loan.
- **Details.** Hand out any buffer with enough capacity (`truncate` / `resize` it), since scoped queries need smaller bitmasks. Offer zeroed loans, for merges and shifts that set only some bits, and unzeroed loans, for AND / OR outputs that overwrite every word. Cap the pool at 4–8 buffers, so one heavy query doesn't hold memory forever.

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
