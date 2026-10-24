# Perseus Latin Corpus Survey

**Measured:** 2026-10-24
**Clone commit:** `nkprasad12/canonical-latinLit@379331f1d2c24c3b5fde440cc46beae4d045fa27` (branch `morcus-user-typos`, merge base `b2a135df22f812afc622e7e14d30889718c252ee` with `PerseusDL/canonical-latinLit@master` from 2026-04-22; see [UPSTREAM.md](UPSTREAM.md) for the 202-commit delta to upstream HEAD `0700a6b7`)
**Scope:** all 398 `perseus-lat*` XML files under `$LIB_XML_ROOT/data/` (98 onboarded in [`library_constants.ts`](../../library_constants.ts))
**Context:** see [README.md](README.md) and [PLAN.md](PLAN.md).

## Regenerating this survey

The one-pass corpus survey is run via the `library` CLI:

```bash
# Survey all Perseus Latin files in $LIB_XML_ROOT and write reports to .cache/library-survey/<label>/
./morcus.sh library survey

# Override the corpus root (e.g. a worktree at upstream/master) or output label
./morcus.sh library survey --root=/path/to/canonical-latinlit --label=upstream-head

# Update the checked-in ratchet snapshot and onboarded fingerprint manifest in src/common/library/audit/
./morcus.sh library survey --write-snapshot
```

> [!NOTE]
> The numbers below were originally collected by the investigation scripts `.investigation/library-preprocessing/corpus_survey.ts` and `xtab.ts` (which also ran the standalone spine/axis prototype `proto_axes.ts` for [§6](#6-axis-relation-and-spine-distributions)). The promoted `./morcus.sh library survey` tool writes `survey.json`, `survey.md`, `manifest.json`, and `census.json` under `.cache/library-survey/<label>/`.

---

## 1. Corpus recount: files vs distinct works

The raw file count (`398`) overstates the number of distinct Latin works to onboard because of multi-edition works and Livy per-book slices:

| Measure                                                           |                  Our clone (`379331f1`) | Upstream HEAD (`0700a6b7`) |
| ----------------------------------------------------------------- | --------------------------------------: | -------------------------: |
| `perseus-lat*` XML files                                          |                                     398 |                    **334** |
| Distinct `textgroup.work` pairs with a Latin edition              |                                     370 |                       ~318 |
| Works with >1 Perseus Latin edition                               |                                      29 |                        ~16 |
| Livy per-book / periochae / fragment slice files                  |                                      47 |   **0** (deleted upstream) |
| **Effective target (distinct, non-redundant works)**              |                                **≈320** |                   **≈300** |
| Onboarded in `LatinWorks` today                                   |                                      98 |      98 (15 files renamed) |
| V1 `processTei2` passes as shipped                                |            **137** (133 in raw scratch) |                          — |
| …of which not in `LatinWorks`                                     |              **39** (36 in raw scratch) |                          — |
| Non-whitespace `<body>` characters (all 398 Latin / 405 surveyed) |                 44,207,296 / 46,090,834 |                          — |
| Non-whitespace `<body>` characters in V1-OK works                 | 21,509,975 (48.7%) / 24,208,933 (52.5%) |                          — |

> [!NOTE] > **137 vs 133 V1-passing files (regenerated in `.cache/library-survey/379331f1-be5eae57/survey.md`):** The initial scratch script `corpus_survey.ts` reported **133** V1-passing `perseus-lat*` files (97 onboarded + 36 non-onboarded) and **16** `metadata: titleStmt incomplete` failures because its DOCTYPE regex (`<!DOCTYPE[^>]*…>`) stopped at the first `>` inside the internal subset of `<TEI.2>` files, leaving a trailing `]>` before `<TEI.2>` that produced 4 false `metadata: titleStmt incomplete` failures: `phi1351.phi003.perseus-lat1` (Tacitus _Dialogus_, onboarded!), `phi1351.phi005.perseus-lat1` (Tacitus _Annales_), `phi2003.phi001.perseus-lat1` (Boethius), and `stoa0079.stoa001.perseus-lat1` (Cyprian). With proper prolog stripping in `./morcus.sh library survey`, all 4 parse and pass `processTei2` — giving **137 / 398** `perseus-lat*` files (**98 / 98** onboarded + **39** non-onboarded, or **144 / 405** including `stoa0276.stoa002.opp-lat1` and the 6 English translations), and reducing `metadata: titleStmt incomplete` from 16 to **12**. Note that the 3 newly-passing non-onboarded `div1` files (`phi1351.phi005`, `phi2003.phi001`, `stoa0079.stoa001`) plus the 5 Livy periochae/fragment slice files pass `processTei2` with **0 citable rows** (`rows=1, pages=0, citable=0`) because V1 ignores `div1` and `div[@type='book']` — caught by `library survey`'s `hasCitableRow` check (8 failing non-onboarded works, 0 onboarded).

---

## 2. V1 status buckets (first error wins)

Running `processTei2` as shipped over all 398 `perseus-lat*` files (and 405 total surveyed files including `opp-lat1` and the 6 `perseus-eng*` translations) and bucketing by the first throwing check:

| Category                                                                                        | `library survey` (`perseus-lat*` / all 405) | Raw scratch (`corpus_survey.md`) | Notes                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------: | -------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **OK**                                                                                          |                           **137** (**144**) |                              133 | All 98 (105) onboarded + 39 non-onboarded (8 of the 39 have `citable=0` and fail `hasCitableRow`)                                            |
| `structure: nesting mismatch` ([INV-3](V1_PREPROCESSING.md#inv-3))                              |                                         132 |                              132 | 74 of these are `Expected "card"`, where the TEI.2 header names Perseus's old chunk unit                                                     |
| `markup: Unknown node: forename` ([INV-12](V1_PREPROCESSING.md#inv-12))                         |                                          34 |                               34 | Livy per-book slice files                                                                                                                    |
| `textParts: refsDecl ambiguous` ([INV-1](V1_PREPROCESSING.md#inv-1))                            |                                          28 |                               28 | ≥2 non-CTS `refsDecl` blocks (20 are Plautus)                                                                                                |
| `markup: content node ()` ([INV-11](V1_PREPROCESSING.md#inv-11))                                |                                          17 |                               17 | Empty `rend=""` attribute (mostly Livy)                                                                                                      |
| `markup: note contents` ([INV-8](V1_PREPROCESSING.md#inv-8)/[INV-9](V1_PREPROCESSING.md#inv-9)) |                                          13 |                               13 | Elements or `rend` values inside `<note>` not in `NOTE_NODES` / `KNOWN_NOTE_REND`                                                            |
| `metadata: titleStmt incomplete` ([INV-15](V1_PREPROCESSING.md#inv-15))                         |                                      **12** |                               16 | Missing `<author>` in `titleStmt` (11 Appendix Vergiliana + 1 HA; scratch had 4 false failures from DOCTYPE internal subset stripping)       |
| `markup: Unknown node: speaker` ([INV-12](V1_PREPROCESSING.md#inv-12))                          |                                           8 |                                8 | Drama / dialogue works whose headers happened to pass INV-1/INV-3                                                                            |
| `markup: content node (Expected "choice", got "expan")`                                         |                                           3 |                                3 | `<abbr><expan>…</expan>text</abbr>` child order in Nepos ([V1_PREPROCESSING.md §3.4](V1_PREPROCESSING.md#34-everything-else--one-line-each)) |
| `structure: preprocess` ([INV-7](V1_PREPROCESSING.md#inv-7))                                    |                                           3 |                                3 | Unresolved `<note target="…">` (paired via `@n` instead of `@xml:id`)                                                                        |
| `markup: Unknown node: ref`                                                                     |                                           2 |                                2 | Cross-reference elements in body                                                                                                             |
| Singletons (1 work each ×9)                                                                     |                                           9 |                                9 | Unknown nodes `desc`, `figure`, `lem`; `<l>` outside `choice`; `rend` values `displayNum`, `F`, `scp`, `spacing`, `align(right)`             |
| **Total**                                                                                       |                               **398** (405) |                          **398** |                                                                                                                                              |

### 2.1 The 39 V1-OK works not in `LatinWorks` (36 in raw scratch)

| Group                                          | Works | IDs                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verse already served via Hypotactic            |    11 | Vergil _Aeneid_ (`phi0690.phi003.perseus-lat2`), Ovid _Remedia Amoris_ / _Metamorphoses_ / _Fasti_ / _Tristia_ / _Ex Ponto_ / _Ibis_ (`phi0959.phi005`–`010.perseus-lat2`), Horace _Carmina_ / _Carmen Saeculare_ / _Epistulae_ (`phi0893.phi001`, `002`, `005.perseus-lat2`), Propertius _Elegiae_ (`phi0620.phi001.perseus-lat3`) |
| Other verse (free wins / multi-source)         |     3 | Martial _Epigrammata_ (`phi1294.phi002.perseus-lat2`, 10,985 rows), Silius Italicus _Punica_ (`phi1345.phi001.perseus-lat2`, 12,222 rows), Valerius Flaccus _Argonautica_ (`phi1035.phi001.perseus-lat2`, 5,615 rows)                                                                                                               |
| Suetonius _De Vita Caesarum_ (10 lives)        |    10 | _Tiberius_ through _Domitianus_ (`phi1348.abo013`–`abo022.perseus-lat2`, `chapter/section`)                                                                                                                                                                                                                                         |
| Pseudo-Caesar & Caesar duplicate edition       |     4 | _De Bello Africo_ (`phi0426.phi001`), _De Bello Alexandrino_ (`phi0428.phi001`), _De Bello Hispaniensi_ (`phi0430.phi001`), plus `phi0448.phi002.perseus-lat3` (duplicate of onboarded `-lat2`)                                                                                                                                     |
| Prose free wins                                |     3 | Aulus Gellius _Noctes Atticae_ (`phi1254.phi001.perseus-lat2`, 4,389 rows), Apuleius _Apologia_ (`phi1212.phi001.perseus-lat1`, 103 rows) and _Florida_ (`phi1212.phi003.perseus-lat2`, 23 rows)                                                                                                                                    |
| Livy periochae / fragment slices (`citable=0`) |     5 | `phi0914.phi00112s`, `00113s`, `00117s`, `00119s.perseus-lat2`, `phi0914.phi001fr.perseus-lat1` (`rows=1, pages=0, citable=0`; deleted upstream)                                                                                                                                                                                    |
| `div1` works passing with `citable=0`          |     3 | Tacitus _Annales_ (`phi1351.phi005.perseus-lat1`), Boethius (`phi2003.phi001.perseus-lat1`), Cyprian (`stoa0079.stoa001.perseus-lat1`) — pass `processTei2` after proper DOCTYPE strip, but with `rows=1, pages=0, citable=0` (caught by `hasCitableRow`)                                                                           |

---

## 3. Blocker clusters across the corpus

Grouping all 265 non-passing files (plus the 36 non-onboarded V1-OK files) by what they actually need rather than which check threw first:

| Cluster | Description                                                                                                                            | Works | Primary blocker                                                                                    | Resolution in [PLAN.md](PLAN.md)                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A**   | Free wins (Gellius, 10 Suetonius lives, Apuleius ×2, Pseudo-Caesar ×3, …)                                                              |   ~16 | Not in `LatinWorks`                                                                                | Phase 1: add + gallery review                                                    |
| **B**   | Clean `textpart` spine, bad header (Ausonius 26, Claudian 14, Prudentius 8, Seneca _Dialogi_ 9, Boethius 6, Statius 3, Nepos 4, …)     |   ~90 | [INV-3](V1_PREPROCESSING.md#inv-3) / [INV-1](V1_PREPROCESSING.md#inv-1)                            | Phase 2: `citeStructure` / tree-derived scheme + arity & coverage assertions     |
| **C**   | Historia Augusta (`phi2331`)                                                                                                           |    30 | [INV-3](V1_PREPROCESSING.md#inv-3) (`work` level in header), no `<author>`, `<note n=…>` pairing   | Phase 1 (`note n=`) + Phase 2 (`citeStructure` + `__cts__.xml` `<ti:groupname>`) |
| **D**   | Livy per-book / periochae slices (`phi0914.phi001*`)                                                                                   |    47 | Covered by `phi0914.phi001`                                                                        | Skip (Decision 3; deleted upstream)                                              |
| **E**   | Drama & dialogue with `<sp>`/`<speaker>` (Plautus 20, Terence 6, Seneca tragedies 10, _De Divinatione_ ×2, _Eclogues_)                 |    39 | `<sp>`/`<speaker>`/`<stage>`; Seneca tragedies have no `textpart` divs (`card` milestones + `<l>`) | Phase 3: speaker content kind + `citeStructure` point/line spines                |
| **F**   | Livy-style personal-name markup                                                                                                        |    35 | `<forename>`, `<addName>`, `<genName>`                                                             | Phase 1: markup table entries                                                    |
| **G**   | Note vocabulary divergence                                                                                                             |   ~30 | `<name>`, `<reg>`, `<choice>`, `<corr>`, `<sic>`, `<p>`, `rend="sub"` inside `<note>`              | Phase 1/2: single markup vocabulary with context predicates                      |
| **H**   | TEI.2 numbered divs (`div1`/`div2`/`div3`) and `<div type="book">`                                                                     |   ~12 | Only `div[@type='textpart']` recognised as spine container                                         | Phase 2: `citeStructure` XPath evaluator (`div1[@type='book']`, etc.)            |
| **I**   | `<lb n>` / `<l>`-only verse (Appendix Vergiliana 11, Horace _Ars Poetica_, Petronius fragments)                                        |   ~14 | No `textpart` divs, missing `<author>`                                                             | Phase 2: `citeStructure` (`.//lb` / `l`) + `__cts__.xml` author                  |
| **J**   | Non-uniform `textpart` leaf depth (Terence prologues, Cicero letters, _Academica_ bks 2–3, Gellius praef., Ausonius, Claudian, Jerome) |    20 | Shallower leaves become uncitable (`id.length < textParts.length`)                                 | Phase 2: declared citability per `citeStructure` level                           |
| **K**   | Multiple editions of the same work                                                                                                     |    29 | Edition selection policy                                                                           | Decision: highest `-latN` unless review overrides                                |

### Largest textgroups by V1 pass rate

| Textgroup  | Author                        | V1 OK / Total | Notes                                                                                                                                                         |
| ---------- | ----------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phi0914`  | Livy                          |        6 / 68 | `phi001` passes; 67 per-book/periochae slices deleted upstream                                                                                                |
| `phi0474`  | Cicero                        |       42 / 60 | Remaining 18: letters (`phi056`–`059`), _Topica_, _Academica_, _Tusculanae_, _De Natura Deorum_, _De Divinatione_, _Paradoxa_, _In Pisonem_, _Verrines_, etc. |
| `phi2331`  | Scriptores Historiae Augustae |        0 / 30 | Cluster C                                                                                                                                                     |
| `stoa0045` | Ausonius                      |        0 / 26 | Cluster B                                                                                                                                                     |
| `phi0588`  | Cornelius Nepos               |       21 / 25 | `abo022`–`abo025` blocked by INV-3 + `<abbr><expan>` order                                                                                                    |
| `phi0119`  | Plautus                       |        0 / 20 | Cluster E                                                                                                                                                     |
| `stoa0089` | Claudian                      |        0 / 14 | Cluster B                                                                                                                                                     |
| `phi1017`  | Seneca the Younger            |        2 / 14 | 10 tragedies (Cluster E) + 2 prose                                                                                                                            |
| `phi1348`  | Suetonius                     |       10 / 12 | 10 lives pass V1 (Cluster A)                                                                                                                                  |
| `phi0692`  | Appendix Vergiliana           |        0 / 11 | Cluster I                                                                                                                                                     |
| `stoa0255` | Seneca (_Dialogi_)            |        1 / 10 | Cluster B                                                                                                                                                     |
| `stoa0238` | Prudentius                    |         1 / 9 | Cluster B                                                                                                                                                     |
| `phi0134`  | Terence                       |         0 / 6 | Cluster E + J                                                                                                                                                 |
| `stoa0058` | Boethius                      |         0 / 6 | Cluster B                                                                                                                                                     |

---

## 4. Markup census (inside `<body>`)

Across all 398 files, the `<body>` vocabulary is small and closed: **69 content elements**, **34 note elements**, **83 `element@rend` pairs in content** (~39 distinct `rend` values), **15 `element@rend` pairs in notes**, and **31 non-structural `element@attr` pairs** appearing in ≥2 works.

**267 of 398 works (67%) have zero markup gaps** against V1's existing allowlists; their only blockers are structural or metadata.

| Distinct markup gaps in work | Works |
| ---------------------------: | ----: |
|                            0 |   267 |
|                            1 |    19 |
|                            2 |    58 |
|                            3 |    30 |
|                            4 |     5 |
|                            5 |    13 |
|                            6 |     1 |
|                            7 |     5 |

### 4.1 Content elements outside `<note>` (all 69)

| Element     | Works | Occurrences | V1 handles? | Element      | Works | Occurrences | V1 handles? |
| ----------- | ----: | ----------: | ----------- | ------------ | ----: | ----------: | ----------- |
| `body`      |   398 |         402 | yes         | `lg`         |    10 |         861 | yes         |
| `div`       |   373 |      78,981 | yes         | `stage`      |    10 |         148 | **no**      |
| `p`         |   293 |      85,945 | yes         | `#comment`   |     9 |          26 | yes         |
| `pb`        |   256 |      28,482 | yes         | `bibl`       |     9 |         392 | yes         |
| `milestone` |   234 |      70,514 | yes         | `div2`       |     9 |       1,644 | yes         |
| `head`      |   224 |       5,462 | yes         | `placeName`  |     8 |          29 | yes         |
| `note`      |   196 |     125,685 | yes         | `date`       |     7 |       1,317 | yes         |
| `l`         |   185 |     211,773 | yes         | `cit`        |     7 |         148 | yes         |
| `del`       |   151 |       3,037 | yes         | `person`     |     6 |          72 | **no**      |
| `gap`       |   149 |       1,670 | yes         | `roleName`   |     6 |          71 | **no**      |
| `q`         |   142 |      15,759 | yes         | `listPerson` |     6 |           6 | **no**      |
| `add`       |   124 |      11,613 | yes         | `title`      |     4 |          12 | yes         |
| `quote`     |   118 |       4,225 | yes         | `ref`        |     3 |         125 | **no**      |
| `foreign`   |    96 |       4,568 | yes         | `emph`       |     3 |           3 | yes         |
| `reg`       |    81 |      54,104 | yes         | `figure`     |     2 |          37 | **no**      |
| `hi`        |    69 |      10,724 | yes         | `said`       |     2 |         131 | yes         |
| `lb`        |    55 |       7,531 | yes         | `unclear`    |     1 |          27 | **no**      |
| `choice`    |    49 |       6,921 | yes         | `space`      |     1 |           2 | **no**      |
| `sic`       |    43 |       6,668 | yes         | `desc`       |     1 |           1 | **no**      |
| `persName`  |    42 |       5,267 | yes         | `w`          |     1 |           1 | yes         |
| `abbr`      |    41 |         690 | yes         | `orig`       |     1 |         110 | yes         |
| `expan`     |    41 |         690 | yes         | `app`        |     1 |           1 | **no**      |
| `sp`        |    39 |      18,583 | **no**      | `lem`        |     1 |           1 | **no**      |
| `speaker`   |    39 |      18,583 | **no**      | `item`       |     1 |         242 | yes         |
| `ex`        |    39 |         673 | yes         | `list`       |     1 |          10 | yes         |
| `corr`      |    37 |       6,625 | yes         | `ab`         |     1 |         141 | yes         |
| `forename`  |    35 |       5,192 | **no**      | `lemma`      |     1 |           2 | **no**      |
| `surname`   |    35 |       5,130 | yes         | `term`       |     1 |           2 | **no**      |
| `addName`   |    35 |       1,676 | **no**      | `docAuthor`  |     1 |           1 | **no**      |
| `name`      |    34 |       1,801 | yes         | `argument`   |     1 |         140 | **no**      |
| `seg`       |    31 |       2,877 | yes         | `text`       |     1 |           4 | **no**      |
| `num`       |    26 |         623 | yes         | `opener`     |     1 |           4 | **no**      |
| `genName`   |    19 |          46 | **no**      | `closer`     |     1 |           4 | **no**      |
| `label`     |    14 |         959 | yes         | `div3`       |     1 |         174 | **no**      |
| `div1`      |    13 |         414 | yes         |              |       |             |             |

### 4.2 Elements inside `<note>` (all 34)

| Element   | Works | Occurrences | V1 handles in note? | Element     | Works | Occurrences | V1 handles in note? |
| --------- | ----: | ----------: | ------------------- | ----------- | ----: | ----------: | ------------------- |
| `hi`      |    82 |     296,869 | yes                 | `bibl`      |     4 |          30 | yes                 |
| `foreign` |    76 |      18,526 | yes                 | `l`         |     4 |          84 | yes                 |
| `gap`     |    44 |         630 | yes                 | `p`         |     3 |          15 | **no**              |
| `name`    |    28 |       3,196 | **no**              | `emph`      |     3 |          41 | yes                 |
| `reg`     |    27 |       1,903 | **no**              | `milestone` |     3 |           7 | yes                 |
| `add`     |    27 |         233 | yes                 | `pb`        |     3 |           3 | yes                 |
| `quote`   |    24 |          62 | yes                 | `num`       |     2 |          15 | yes                 |
| `del`     |    22 |         181 | yes                 | `figure`    |     2 |         544 | **no**              |
| `w`       |    17 |         977 | yes                 | `title`     |     2 |          18 | yes                 |
| `app`     |    16 |         690 | yes                 | `#comment`  |     1 |           1 | **no**              |
| `lem`     |    16 |         690 | yes                 | `rdg`       |     1 |           1 | yes                 |
| `q`       |    16 |          61 | yes                 | `cit`       |     1 |           6 | yes                 |
| `date`    |    16 |       1,467 | yes                 | `head`      |     1 |           4 | **no**              |
| `choice`  |    11 |          19 | **no**              | `gloss`     |     1 |           2 | yes                 |
| `corr`    |    11 |          19 | **no**              | `placeName` |     1 |          46 | yes                 |
| `sic`     |    11 |          19 | **no**              | `persName`  |     1 |          28 | yes                 |
| `note`    |    10 |          39 | yes                 | `surname`   |     1 |          28 | yes                 |

### 4.3 Top `element@rend` values (content and notes)

Top content `element@rend` pairs (works ≥ 2, plus all unknown singletons; omitting visual-gap dot/asterisk variants handled by `isVisualGap`):

| `element@rend`                   | Works | Occurrences | V1 known? | Notes                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----: | ----------: | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote@blockquote`               |    59 |       1,163 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `hi@italics`                     |    40 |       3,829 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `p@indent`                       |    19 |       1,456 | yes       | Handled (mostly renamed to `align(indent)` upstream)                                                                                                                                                                                                                                                                                          |
| `q@single`                       |    12 |         108 | yes       | Known (ignored; literal quotes emitted)                                                                                                                                                                                                                                                                                                       |
| `hi@7`                           |    12 |         161 | yes       | Known (ignored)                                                                                                                                                                                                                                                                                                                               |
| `q@double`                       |    11 |       1,176 | yes       | Known                                                                                                                                                                                                                                                                                                                                         |
| `q@double; merge`                |    11 |         846 | yes       | Known                                                                                                                                                                                                                                                                                                                                         |
| `hi@overline`                    |    10 |         915 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `q@merge`                        |     9 |       4,248 | yes       | Known                                                                                                                                                                                                                                                                                                                                         |
| `l@indent`                       |     8 |       5,320 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `p@align(indent)`                |     6 |       1,323 | yes       | **Known but NOT in `HANDLED_REND`** (6,555 upstream!)                                                                                                                                                                                                                                                                                         |
| `quote@smallcaps`                |     6 |          28 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `hi@italic`                      |     6 |       3,130 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `label@opener`                   |     6 |         937 | **no**    | Unhandled                                                                                                                                                                                                                                                                                                                                     |
| `l@bulletted`                    |     5 |           5 | **no**    | Unhandled                                                                                                                                                                                                                                                                                                                                     |
| `l@align(indent)`                |     4 |          40 | yes       | Known, not handled                                                                                                                                                                                                                                                                                                                            |
| `seg@dateline`                   |     4 |         930 | **no**    | Epistolary datelines                                                                                                                                                                                                                                                                                                                          |
| `seg@salute`                     |     4 |         934 | **no**    | Epistolary salutations                                                                                                                                                                                                                                                                                                                        |
| `milestone@indent`               |     4 |         121 | yes       | Dropped with milestone                                                                                                                                                                                                                                                                                                                        |
| `q@single; merge`                |     3 |         256 | yes       | Known                                                                                                                                                                                                                                                                                                                                         |
| `hi@smallcaps`                   |     3 |         147 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `quote@align(blockquote)`        |     3 |         107 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `hi@sup`                         |     2 |         135 | yes       | **Known, NOT handled in body** ([PLAN.md §4.2](PLAN.md#42-fidelity-gaps-shipping-today-none-caught-by-any-check))                                                                                                                                                                                                                             |
| `hi@bold`                        |     2 |         117 | yes       | **Known, NOT handled in body**                                                                                                                                                                                                                                                                                                                |
| `hi@ital`                        |     2 |       1,722 | yes       | Handled                                                                                                                                                                                                                                                                                                                                       |
| `hi@super`                       |     2 |         156 | **no**    | Unhandled                                                                                                                                                                                                                                                                                                                                     |
| Unknown singletons (1 work each) |    18 |           — | **no**    | `gap@space` (5), `p@inddent` (1, typo), `quote@bockquote` (1, typo), `emph@salute` (1), `hi@caps` (18), `lb@displayNum` (4), `l@F` (1), `head@align(center)` (124), `hi@scp` (392), `q@spacing` (43), `q@spacing; merge` (9), `quote@spacing` (2), `emph@box` (1), `quote@align(blockquote` (1, typo), `q@undirect` (1), `l@align(right)` (1) |

Inside `<note>`, 15 `element@rend` pairs occur: 9 known (`hi@italics` 56, `hi@italic` 26, `hi@overline` 20, `hi@superscript` 11, `hi@sup` 9, `quote@blockquote` 2, `quote@smallcaps` 1, `emph@italic` 1, `hi@bold` 1) and 6 unknown singletons (`hi@sub`, `hi@subscript`, `q@double`, `q@single`, `gap@ . . . `, `gap@. . . .`).

### 4.4 Content attributes (works ≥ 2, excluding `n`, `type`, `subtype`, `rend`, `xml:lang`, `xml:id`)

| `element@attr`   | Works | `element@attr`  | Works |
| ---------------- | ----: | --------------- | ----: |
| `milestone@unit` |   234 | `placeName@key` |     6 |
| `gap@reason`     |   121 | `note@resp`     |     6 |
| `l@part`         |    68 | `expan@xmlns`   |     5 |
| `note@place`     |    67 | `date@when`     |     4 |
| `div@org`        |    66 | `pb@ed`         |     4 |
| `div@sample`     |    66 | `gap@extent`    |     3 |
| `div@part`       |    65 | `del@status`    |     3 |
| `note@anchored`  |    60 | `gap@unit`      |     2 |
| `milestone@resp` |    37 | `foreign@lang`  |     2 |
| `note@target`    |    37 | `div@met`       |     2 |
| `forename@full`  |    34 | `num@value`     |     2 |
| `surname@full`   |    34 |                 |       |
| `addName@full`   |    34 |                 |       |
| `l@xml:base`     |    27 |                 |       |
| `lb@ed`          |    26 |                 |       |
| `genName@full`   |    19 |                 |       |
| `pb@id`          |    10 |                 |       |
| `milestone@ed`   |    10 |                 |       |
| `sp@who`         |    10 |                 |       |
| `div@xml:base`   |     9 |                 |       |

### 4.5 Gap items ranked by works affected

Each entry below shows how many works contain a given unhandled element or unknown `rend` value:

| Gap item            | Works | Gap item                                                                                                                                                                                                                                                                    |  Works |
| ------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| `<sp>`              |    39 | `<ref>`                                                                                                                                                                                                                                                                     |      3 |
| `<speaker>`         |    39 | `note:<p>`                                                                                                                                                                                                                                                                  |      3 |
| `<forename>`        |    35 | `<figure>`                                                                                                                                                                                                                                                                  |      2 |
| `<addName>`         |    35 | `note:<figure>`                                                                                                                                                                                                                                                             |      2 |
| `note:<name>`       |    28 | `rend:hi@super`                                                                                                                                                                                                                                                             |      2 |
| `note:<reg>`        |    27 | Singletons (38 items, 1 work each)                                                                                                                                                                                                                                          | 1 each |
| `<genName>`         |    19 | — Elements (15): `<unclear>`, `<space>`, `<desc>`, `<app>`, `<lem>`, `<lemma>`, `<term>`, `<docAuthor>`, `<argument>`, `<text>`, `<opener>`, `<closer>`, `<div3>`, `note:<#comment>`, `note:<head>`                                                                         |        |
| `note:<choice>`     |    11 | — Content rends (17): `gap@space`, `p@inddent`, `quote@bockquote`, `emph@salute`, `hi@caps`, `lb@displayNum`, `l@F`, `head@align(center)`, `hi@scp`, `q@spacing`, `q@spacing; merge`, `quote@spacing`, `emph@box`, `quote@align(blockquote`, `q@undirect`, `l@align(right)` |        |
| `note:<corr>`       |    11 | — Note rends (6): `hi@sub`, `hi@subscript`, `q@double`, `q@single`, `gap@ . . . `, `gap@. . . .`                                                                                                                                                                            |        |
| `note:<sic>`        |    11 |                                                                                                                                                                                                                                                                             |        |
| `<stage>`           |    10 |                                                                                                                                                                                                                                                                             |        |
| `<listPerson>`      |     6 |                                                                                                                                                                                                                                                                             |        |
| `<person>`          |     6 |                                                                                                                                                                                                                                                                             |        |
| `<roleName>`        |     6 |                                                                                                                                                                                                                                                                             |        |
| `rend:label@opener` |     6 |                                                                                                                                                                                                                                                                             |        |
| `rend:l@bulletted`  |     5 |                                                                                                                                                                                                                                                                             |        |
| `rend:seg@dateline` |     4 |                                                                                                                                                                                                                                                                             |        |
| `rend:seg@salute`   |     4 |                                                                                                                                                                                                                                                                             |        |

---

## 5. Header and structural facts

| Fact                                                                           | Works (of 398) |
| ------------------------------------------------------------------------------ | -------------: |
| No `<author>` in `titleStmt`                                                   |             41 |
| No `<title>` in `titleStmt`                                                    |              0 |
| `0` `<refsDecl>` blocks                                                        |              0 |
| `1` `<refsDecl>` block                                                         |            137 |
| `2` `<refsDecl>` blocks                                                        |            238 |
| `3+` `<refsDecl>` blocks                                                       |             23 |
| `≥2` non-CTS `<refsDecl>` blocks (triggers [INV-1](V1_PREPROCESSING.md#inv-1)) |             24 |
| Has `<front>` matter                                                           |              6 |
| Has `<back>` matter                                                            |              2 |
| `<body>` count ≠ 1                                                             |              1 |
| Sibling `__cts__.xml` present                                                  |            310 |
| `<div type="textpart">` without `@n` inside `<body>`                           |              6 |
| Non-uniform `textpart` leaf depth                                              |             20 |
| No `textpart` divs at all                                                      |            105 |

`text/@xml:lang` values across the 398 files: `(none)`: 188 · `lat`: 127 · `la`: 83.

### 5.1 Milestone units across the corpus

| `@unit`     | Works | Occurrences | `@unit`                            |  Works |                                                                                                                                                                                                                                                                                     Occurrences |
| ----------- | ----: | ----------: | ---------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `chapter`   |   111 |       6,280 | `line`                             |      3 |                                                                                                                                                                                                                                                                                           1,410 |
| `section`   |   110 |      50,561 | `chapter2`                         |      2 |                                                                                                                                                                                                                                                                                              14 |
| `card`      |    41 |       1,656 | Singletons (17 units, 1 work each) | 1 each | `vulgate-letter` (397), `folio page` (250), `tale` (137), `meter` (116), `unit` (35), `fragment` (32), `mspage` (32), `alt_poem_line` (20), `thruline` (16), `alternatesection` (5), `volume` (3), `oldbooknum` (3), `act` (1), `book` (1), `oldbook` (1), `alternatechpater` (1), `sectin` (1) |
| `para`      |    25 |       2,850 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `paragraph` |     7 |       4,842 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `Book`      |     6 |           6 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `loebline`  |     6 |         922 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `alt`       |     5 |         395 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `carte`     |     4 |         121 |                                    |        |                                                                                                                                                                                                                                                                                                 |
| `Para`      |     3 |         413 |                                    |        |                                                                                                                                                                                                                                                                                                 |

**50 of the 98 currently onboarded works** contain non-book milestone axes (`chapter` in 38 Cicero speeches/treatises, `section` ×6,927 and `paragraph` ×4,807 in Pliny's _Naturalis Historia_, `meter` ×116 in Catullus, `card` ×213 in Lucretius, `alt` ×359 in Curtius Rufus, `carte` in Ovid, `mspage` in Tertullian) that V1 silently drops today.

### 5.2 `div` `type/subtype` combinations (top)

`edition/-` 290 · `textpart/section` 138 · `textpart/chapter` 113 · `textpart/book` 81 · `book/-` 72 · `textpart/poem` 43 · `textpart/scene` 26 · `textpart/act` 26 · `edition/edition` 15 · `textpart/letter` 8 · `section/-` 6 · `textpart/speech` 4 · `poem/-` 4 · `chapter/-` 4 · `letter/-` 4 · `textpart/Book` 3 · `textpart/preface` 2 · plus 17 singletons (including typos `textpart/chaper`, `textpart/secton`, `textpart/praeface`).

### 5.3 The 105 files with no `textpart` divs

| Count | Structure used                                                         | Examples                                                                                                                                                                                                                                                                                 |
| ----: | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    66 | `<div type="book">` + `section`/`chapter`/`line` milestones (or empty) | Livy per-book and periochae slice files (`phi0914.phi0011`–`00145`, `001fr`; deleted upstream)                                                                                                                                                                                           |
|    10 | `<div type="edition">` + `<l>`, `<sp>`, `card` milestones              | Seneca's 10 tragedies (`phi1017.phi001`–`phi010`)                                                                                                                                                                                                                                        |
|    11 | Bare `<l>` / `<lb>` or `div1` with no `textpart`                       | Appendix Vergiliana (`phi0692.phi001`–`phi013`)                                                                                                                                                                                                                                          |
|    11 | TEI.2 `div1`/`div2`/`div3` containers                                  | Cicero _De Divinatione_ (`phi0474.phi053.perseus-lat2`), Tacitus _Dialogus_ (`phi1351.phi003`) & _Annales_ (`phi1351.phi005`), Ausonius/Symmachus (`stoa0261`), Augustine (`stoa0040.stoa011`), Boethius (`phi2003.phi001`), Sidonius (`stoa0054.stoa006`), Cyprian (`stoa0079.stoa001`) |
|     4 | `<div type="edition">` + `<l>` (+ `carte`/`alt` milestones)            | Horace _Ars Poetica_ (`phi0893.phi006`), Ovid _Remedia Amoris_ (`phi0959.phi005`) & _Ibis_ (`phi0959.phi010`)                                                                                                                                                                            |
|     3 | Petronius poem/fragment files                                          | `phi0972.phi001`, `phi001f`, `phi001p.perseus-lat1`                                                                                                                                                                                                                                      |

---

## 6. Axis relation and spine distributions

Running the `textpart`-spine prototype (`proto_axes.ts`, [OUTPUT_MODEL.md §10](OUTPUT_MODEL.md#10-prototype-validation)) across all 398 works answers the corpus-wide distribution questions posed in [OUTPUT_MODEL.md §12](OUTPUT_MODEL.md#12-picking-this-up-later):

- **Prototype outcomes:** 26 prototype errors (25 works with no `<div>` at all, plus 1 XML comment strip issue in `phi1212.phi001`), 80 `NO_SPINE` (works whose containers are `<div type="book">` or `div1` rather than `textpart`), **0 works with zero citable rows**, and **5 coverage mismatches** (Catullus `phi0472.phi001`, Lucan `phi0917.phi001`, Florus `phi1242.phi001`, and two fragment files `phi0914.phi001fr`, `phi0972.phi001f`).
- **Works with milestone axes:** 221 works have at least one milestone axis; 177 have none.

### 6.1 Axis relation distribution

| Relation   | Axes (total 325) | Works with ≥1 such axis | Top `unit → relation` pairs                                                                                                                                                       |
| ---------- | ---------------: | ----------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crossing` |              185 |                     129 | `chapter → crossing` (74), `section → crossing` (36), `para → crossing` (23), `paragraph → crossing` (7), `Book → crossing` (6), `loebline → crossing` (6), `card → crossing` (5) |
| `finer`    |              115 |                      80 | `section → finer` (64), `chapter → finer` (34), `card → finer` (14), `meter → finer` (1), `para → finer` (1), `alt → finer` (1)                                                   |
| `aligned`  |               13 |                      13 | `card → aligned` (13)                                                                                                                                                             |
| `coarser`  |               12 |                      12 | `card → coarser` (8), `para → coarser` (1), `section → coarser` (1), `alternatechpater → coarser` (1)                                                                             |

> [!IMPORTANT] > **`crossing` is the dominant relation (185 of 325 axes), and `aligned` is rare (13, all `card`).** Promoting milestones into the hierarchical spine is almost never available for undeclared secondary axes; inline citable anchors ([OUTPUT_MODEL.md §3](OUTPUT_MODEL.md#3-axisrelation-is-the-load-bearing-field)) are the general mechanism needed in Phase 4.

### 6.2 Prototype diagnostics across the corpus

| Diagnostic code         | Works | Meaning                                                                                                                                                                                       |
| ----------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MARKER_NOT_EXPOSED`    |   271 | Contains `<pb>` or `<lb>` markers recognised and intentionally not exposed as citation axes                                                                                                   |
| `NO_SPINE`              |    80 | No `div[@type='textpart']` found (resolved in Phase 2 by `citeStructure`)                                                                                                                     |
| `AXIS_KEYS_SCOPED`      |    63 | Axis ordinals required a spine prefix (`1` or `2` levels) to disambiguate                                                                                                                     |
| `AXIS_KEYS_AMBIGUOUS`   |    63 | Repeated ordinals within the same spine row (e.g. Pliny TOC / Livy slices) — handled by `markerId` vs `key` ([OUTPUT_MODEL.md §2](OUTPUT_MODEL.md#markerid-vs-key--identity-is-not-citation)) |
| `AXIS_ORDINAL_INVENTED` |    34 | Milestone marker lacked `@n` / `@xml:id` / `@corresp`                                                                                                                                         |

### 6.3 Top `textpart` spine shapes

`(none)` 80 · `chapter` 63 · `section` 63 · `act/scene` 25 · `poem` 24 · `book/chapter/section` 23 · `book/poem` 18 · `chapter/section` 18 · `book` 14 · `book/section` 12 · `book/chapter` 7 · `speech/section` 3 · `Book/letter/section` 3 · `book/letter/section` 3 · `preface` 2 · plus 15 singletons.
