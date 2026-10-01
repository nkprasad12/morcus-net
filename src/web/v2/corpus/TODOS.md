# Corpus (UI V2) TODOs

The V2 UI does not have a corpus search surface yet. This file tracks corpus issues found while building V2 features that consume corpus output (e.g. reader `matchText` highlighting).

## Word tokens split at inline markup

**Status:** ✅ Resolved (no longer blocks the V2 corpus ship, [DESIGN.md §12](DESIGN.md#12-phases)), together with the reader-side follow-up [below](#reader-word-boundaries-at-inline-markup). Found while building reader `matchText` highlighting.

**Symptom (before the fix).** The corpus indexer broke a word into separate tokens wherever inline markup fell inside it. In those rows:

- Searching for the whole word (e.g. `epistula`) did not find it, because the corpus only had the pieces.
- The word offsets in corpus results (which become `matchText=id~start~end`) disagreed with what the V2 reader counts. Every highlight after the split word landed on the wrong words.

**Cause.** [`extractRowText`](../../../common/library/corpus/corpus_library_utils.ts) joined a node's children with `" "`. For `epist<…>u</…>la` it produced `epist u la`, which `processTokens` indexed as three words. The V2 preprocessor (`v2_preprocessor.ts`) drops styling-free wrapper elements and renders `epistula`, which the reader tokenizes as one word.

**Fix.** `extractRowText` now follows the [word-boundary rule](#word-boundary-rule) below: it concatenates siblings directly and relies on the source text's own whitespace, adding breaks only at structure and between adjacent tags. Whitespace is then normalized once per row. Unit tests, and a regression test that renders fixtures through the real V2 preprocessor and client tokenizer, are in `corpus_library_utils.test.ts`.

**Result** (library-wide comparison of per-row corpus word offsets against V2-rendered, client-tokenized words, ignoring case): rows that disagree went from **1,243 to 161** of 146,951 with the indexer fix (before it, Pliny _Nat. Hist._ alone accounted for 858), then to **92** with reader fix 2 and **0** with reader fix 1 ([below](#reader-word-boundaries-at-inline-markup)).

- V1's reader splits words at markup the same way the old corpus did, so its highlights drift in these rows now. That is accepted: V1 is frozen and will be replaced by V2.

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

## Reader word boundaries at inline markup

**Status:** ✅ Resolved. The 161 rows left over by the indexer fix were places where the **V2 reader** broke the [word-boundary rule](#word-boundary-rule) in two opposite ways, so `matchText` highlights in them could land a word or two off. With both fixes below, no row in the library disagrees (0 of 146,951). The rows in [Source typos](#source-typos-missing-space-after-a-tag) no longer show up as mismatches because the corpus and reader now join them the same (wrong) way.

1. **The reader split at tag-meets-text seams (broke rule 1).** Cicero `phi0474.phi043` `<hi>im</hi>petu`, Pliny `i<hi>am</hi>`, enclitics `<hi>vallem</hi>que`, and Pliny's partly overlined numerals (`‾DC‾VII`, `CC‾XLVIII‾`, `|‾XIII‾|`, each one number): `tokenizeSubtree` tokenized each text node separately. **Fix:** an opt-in `joinAcrossInline` option in `core/tokenize.client.ts`, enabled only by the reader (`enhancePassage`; the dictionary keeps per-text-node tokenizing). It tokenizes runs of text across inline styling elements (`italic`, `bold`, `overline`, `smallcaps`, `uppercase`, `superscript` spans, `<strong>`) and breaks at any other element or rejected subtree (note links, `.reader-gap`). A word that crosses an element becomes several `lat-word` parts with the whole word in `data-word`, the same word index (so `.reader-match` marks every part), and a shared `data-word-group`. Only the first part is a `role="button"` with `tabindex` and an `aria-label` of the whole word; later parts are `aria-hidden`. Clicking any part looks up the whole word, and `word-active` and hover (`syncWordGroupHover`, `.word-hover`) style the whole group. Keyboard focus rings still outline only the first part.
2. **The reader joined at tag-meets-tag seams (broke rules 2–3).** `renderXmlNodeCleanHtml` dropped unstyled wrappers and pasted their contents together, so Livy `</choice><choice>` rendered `tumCocles` and Pliny `<add>endi</add><add>fingendi</add>` rendered `pingendifingendique`; italic pairs displayed run together (_sehabere_). **Fix:** the preprocessor emits a space between two adjacent inline sibling elements that both carry text, unless the first ends in `-` or the source already has whitespace there. Note, gap, `br`, `space` and line/block/heading/list elements get no space, so `word[1]` markers stay flush. Visual suite: no pixel diffs.

**Verification script.** A throwaway script (all library works rendered through `preprocessWorkToV2`, tokenized with `tokenizeSubtree` and `joinAcrossInline` under JSDOM, compared with `processTokens(extractRowText(row))`) produced the numbers above. The regression tests in `corpus_library_utils.test.ts` check the same property on fixtures for every rule.

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
