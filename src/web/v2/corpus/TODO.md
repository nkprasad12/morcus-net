# Corpus (UI V2) TODOs

The V2 UI does not have a corpus search surface yet. This file tracks corpus issues found while building V2 features that consume corpus output (e.g. reader `matchText` highlighting).

## Word tokens split at inline markup

**Status:** Open. **Blocks the V2 corpus ship** ([DESIGN.md §12](DESIGN.md#12-phases)); UI work proceeds in parallel. Found while building reader `matchText` highlighting.

**Symptom.** The corpus indexer breaks a word into separate tokens wherever inline markup falls inside it. In those rows:

- Searching for the whole word (e.g. `epistula`) does not find it, because the corpus only has the pieces.
- The word offsets in corpus results (which become `matchText=id~start~end`) disagree with what the V2 reader counts. Every highlight after the split word lands on the wrong words.

**Cause.** [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts) joins a node's children with `" "`. For `epist<…>u</…>la` it produces `epist u la`, which `processTokens` indexes as three words. The V2 preprocessor (`v2_preprocessor.ts`) drops styling-free wrapper elements and renders `epistula`, which the reader tokenizes as one word.

**Scale** (library-wide comparison of per-row corpus tokens against V2-rendered tokens): 1,329 of 125,763 rows (≈1.1%) differ, all for this reason. They are concentrated in a few works:

| Work                                                | Rows affected |
| :-------------------------------------------------- | :------------ |
| `phi0978.phi001.perseus-lat2` (Pliny, _Nat. Hist._) | 858 / 1,248   |
| `phi1038.phi001.perseus-lat1`                       | 158 / 1,034   |
| `phi0474.phi011.perseus-lat2` (Cicero, `x viri`)    | 64 / 154      |
| `phi0914.phi001.perseus-lat2` (Livy)                | 41 / 20,378   |
| `hypotactic_Tristia_Ovid`                           | 40 / 3,532 ¹  |
| others (mostly `phi0474.*`)                         | < 40 each     |

¹ Probably the unrelated Tristia section-id issue tracked in [`reader/FEATURE_PARITY.md`](../reader/FEATURE_PARITY.md), not this bug.

**Proposed fix.** In `extractRowText`, insert whitespace only at the structural boundaries it already marks (`block`, `l`, `rend="indent"`, `rend="blockquote"`) and join other siblings with `""`, then rebuild the corpus. Check that the raw source strings already carry the whitespace between ordinary words, so no words get fused.

- V1's reader splits words at markup the same way the corpus does today, so its highlights would drift in these rows after the fix. That is accepted: V1 is frozen and will be replaced by V2.
- After the fix, re-run the alignment check below and expect ~0 mismatches.

**Verification script.** A throwaway comparison script (corpus input from `build-tmp/library_corpus_input` vs. V2 artifacts in `build/library_processed`, tokenized with the reader's rules) was used to produce the numbers above. If this is fixed, consider checking it in as a test over a small fixture work.

## Heading rows cannot be highlighted

Non-leaf rows (e.g. a chapter heading row `1.2` above sections `1.2.1…`) are indexed by the corpus but rendered by V2 without an `id` (1,359 rows library-wide). A `matchText` range that falls in such a row resolves the right page but highlights nothing. Low priority; fixing it needs a stable per-row identifier (e.g. `data-row-id`) on every rendered section.

## Beyond V1 parity

The V2 corpus is built to match V1 first ([DESIGN.md](DESIGN.md) §1, goal 6). These go past V1 and are deferred until it ships.

### Previous page

V1 showed a Back button that was always disabled ("Back doesn't work yet"); V2 has only a Next link and relies on browser Back. The engine pages forward only: a cursor (`resultId-resultIndex-candidateIndex`) says where the _next_ page starts, and nothing computes the one before it. Options:

| Option                                             | Pros                                                                                                         | Cons                                                                                                               |
| :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| Cursor trail in the URL (`prev=c1.c2.c3`)          | A real Previous link, even on shared links. Stateless. Adds to the current URL contract without changing it. | URL grows ~15 chars per page. A cap (e.g. last 10) limits how far back it goes. The same page gets different URLs. |
| Server-side cursor cache (`page=N`, LRU per query) | Clean URLs, numbered pages.                                                                                  | Server state. A miss re-runs N forward queries, and `runQuery` blocks the event loop.                              |
| Engine support (reverse cursors or offsets)        | Best UX: Previous, page numbers, jump to page.                                                               | Rust work.                                                                                                         |

A "First page" link is a cheap first step if the others wait.

### Author filter beyond V1

V1 (and V2) accept one `#Author` at the start of the query. Gaps:

- **Names with spaces can't be expressed.** `Seneca Major` and `Seneca Minor` are in the author list, but the tokenizer splits on spaces. Options: space-free aliases (`#SenecaMajor`) mapped to engine names, or rename the authors at corpus build time.
- **One author per query.** The engine already accepts `[A, B] query`; the grammar allows only one `#`. Extend it to `#A #B`.
- **Discovery without JS.** Only autocomplete lists the authors. The help section could list them as example links.
- **Considered alternative:** a native `author=` checkbox list in the form. It works without JS and handles spaces, but it gives the same filter two sources of truth next to `#Author`, unless `#` is dropped from the grammar.
