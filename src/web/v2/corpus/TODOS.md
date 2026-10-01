# Corpus (UI V2) TODOs

Open corpus work. See [`README.md`](README.md) for how the slice is built.

## Word-boundary rule

The corpus and the V2 reader must agree on where words start and end, because corpus word offsets become reader `matchText` highlight ranges. The rule is implemented in [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts) and documented on it.

Editorial tags (`<add>`, `<corr>`, `<hi>`, …) wrap whatever stretch of text they annotate: part of a word, a word, or several. Their edges therefore say nothing about word boundaries by themselves.

1. **Whitespace decides.** Where a tag meets text with no whitespace between, it is the same word: Pliny `ping<add>endi</add>…`, Cicero `<hi>im</hi>petu`.
2. **Two sibling tags that meet with nothing between them are a word break.** If the content were one continuous stretch, one tag would have covered it. In the source TEI the space falls between the tags: Pliny `ping<add>endi</add><add>fingendi</add>que` (the edition's own note reads _"pingendi fingendique"_), Livy `<choice>…tum…</choice><choice>…Cocles…</choice>`, Livy `<hi>se</hi><hi>habere</hi>`.
3. **Exception to 2:** if the first tag ends in `-`, it's a word hyphenated across a line break, so join: Pliny `<hi>lon-</hi><hi>gitudo</hi>`.
4. **Structure always breaks:** lines, blocks, headings, `br`, and note, gap and space markers.

**Review.** Every seam in the library where the rule changes the tokens (a tag meeting text or another tag, with word characters on both sides; 9,661 seams in 125 works) was checked against Morceus: is the joined form a word, the split pieces, or both? Everything ambiguous or contradicting the rule was then read by hand (checking the raw TEI where needed), and a sample of the rest.

| Seam                          | Count | Result                                                                                                                                                                                                         |
| :---------------------------- | :---- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag meets tag (rule 2: split) | 143   | 125 correct, 17 are manuscript sigla (`R²E²v`) in Pliny's main text where it doesn't matter, 1 hyphenation miss (now rule 3)                                                                                   |
| Tag meets text (rule 1: join) | 9,518 | All correct except ≈10, which are missing spaces in the source TEI ([below](#source-typos-missing-space-after-a-tag)). Includes 90 numeral + `vir` forms (`<num>x</num>viros`, _decemviros_), correctly joined |

**Where the rule is implemented.** Library-wide, no row's corpus word offsets disagree with the
V2 reader's word count (0 of 146,951 rows). Keep these three in step:

- **Indexer:** [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts)
  concatenates siblings directly, relying on the source's own whitespace, and adds breaks only at
  structure and between adjacent tags (rules 2–4). Regression tests in
  `corpus_library_utils.test.ts` render fixtures through the real V2 preprocessor and client
  tokenizer.
- **Preprocessor** (`v2_preprocessor.ts`): emits a space between two adjacent inline sibling
  elements that both carry text, unless the first ends in `-` or the source already has whitespace
  there (rules 2–3). Note, gap, `br`, `space` and line/block/heading/list elements get no space, so
  note markers stay flush.
- **Reader tokenizer:** the opt-in `joinAcrossInline` option in `core/tokenize.client.ts`, enabled
  only by the reader, tokenizes across inline styling elements (rule 1). A word that crosses an
  element becomes several `lat-word` parts sharing `data-word`, one word index and a
  `data-word-group`; only the first part is focusable (`role="button"`, `aria-label` of the whole
  word) and later parts are `aria-hidden`. The dictionary keeps per-text-node tokenizing.

V1's reader still splits words at markup, so its highlights drift in these rows. That is accepted:
V1 is frozen.

## Source typos: missing space after a tag

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

## Heading rows cannot be highlighted

Non-leaf rows (e.g. a chapter heading row `1.2` above sections `1.2.1…`) are indexed by the corpus but rendered by V2 without an `id` (1,359 rows library-wide). A `matchText` range that falls in such a row resolves the right page but highlights nothing. Low priority; fixing it needs a stable per-row identifier (e.g. `data-row-id`) on every rendered section.

## Beyond V1 parity

The V2 corpus matched V1 first. These go past V1.

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
