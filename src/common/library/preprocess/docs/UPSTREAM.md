# Upstream Perseus (`canonical-latinLit`): Changes & Policy

**Measured:** 2026-10-24
**Merge base:** `b2a135df22f812afc622e7e14d30889718c252ee` (2026-04-22)
**Our fork (`morcus-user-typos`):** `379331f1d2c24c3b5fde440cc46beae4d045fa27` (3 local typo commits ahead of merge base)
**Upstream HEAD (`PerseusDL/canonical-latinLit@master`):** `0700a6b7e010707367502a83e08e99ebbbb3666c` (2026-10-20, **202 commits ahead** of merge base)
**Context:** see [PLAN.md §5](PLAN.md#5-upstream-perseus-what-changed-and-what-it-means) and [CORPUS_SURVEY.md](CORPUS_SURVEY.md).

---

## 1. Overview of the 202-commit delta

Between April and October 2026, `PerseusDL/canonical-latinLit` landed 202 commits touching 1,024 files (Lisa Cerrato 172, Charles Pletcher 17, Alison Babeu 8, Gregory Crane 4, Thibault Clérice 1). Commit messages reference `review_work`, `HookTest` (CapiTainS validation), and `MVP` — a corpus-wide cleanup pass bringing the Latin corpus up to TEI P5 / EpiDoc / CapiTainS compliance for Perseus's new platform.

| Metric                                                           | Our clone (`379331f1`) |                  Upstream HEAD (`0700a6b7`) |
| ---------------------------------------------------------------- | ---------------------: | ------------------------------------------: |
| `perseus-lat*` XML files                                         |                    398 |                                     **334** |
| Files with `<refsDecl xml:id="CTS">` + `<citeStructure>`         |                      0 |                               **326 / 334** |
| Livy per-book / periochae / fragment slice files                 |                     47 |    **0** (67 Latin + English files deleted) |
| Re-editioned Latin works (`-lat1` → `-lat2` / `-lat3` / `-lat4`) |                      — | **25 works** (15 onboarded in `LatinWorks`) |
| Renamed work directories (`stoa0261/stoa000N` → `stoa00N`)       |                      — |                       **2 works** (3 files) |
| `p rend="align(indent)"` occurrences                             |                  1,367 |                                   **6,555** |
| `p/l rend="indent"` occurrences                                  |                  6,897 |                                   **6,396** |
| Files with versioned `<licence>` (all CC BY-SA 4.0)              |                      0 |                                **99 / 334** |
| Files retaining `<!DOCTYPE …>`                                   |                   ~398 |   **20 / 334** (rest use `<?xml-model …?>`) |

No work in the corpus was structurally re-nested from milestones to `<div>`s or vice versa (verified across _Topica_, _De Officiis_, _Pro Sestio_, Seneca _Medea_, Tacitus _Annales_, Symmachus, Plautus, and Historia Augusta; note that 9 Suetonius lives had earlier milestone-to-div conversions recorded in their `<change>` log). All 301 modified Latin files show structural diff lines because `xml:base` URN attributes were added to `<body>` and every `textpart` `<div>`, and `<refsDecl xml:id="CTS">` blocks were added to headers.

---

## 2. `<citeStructure>` adoption and the 19 `match` patterns

In August 2026, upstream added TEI P5 `<refsDecl xml:id="CTS">` blocks containing nested `<citeStructure>` elements to **326 of the 334** Latin files. The only 8 files without `<citeStructure>` are six Cicero rhetorica `-lat2` files (`phi0474.phi036`–`phi041`, mid-migration), Vitruvius (`phi1056.phi001.perseus-lat2`), and Sidonius (`stoa0054.stoa006.perseus-lat1`).

Across all 326 files, every `<citeStructure match="…" unit="…">` attribute uses a closed vocabulary of **19 normalized XPath patterns** (1 root pattern + 18 step patterns):

|   # | Normalized `match` pattern                | Count | Kind             | Concrete `@subtype` / `@type` / `@unit` values (occurrences)                                                  |
| --: | ----------------------------------------- | ----: | ---------------- | ------------------------------------------------------------------------------------------------------------- |
|   1 | `/TEI/text/body`                          |   327 | Root             | Outer `citeStructure` root step (326 files; 1 file has 2)                                                     |
|   2 | `div/div[@subtype='X']`                   |   283 | Container        | `chapter` (83), `book` (78), `section` (67), `act` (26), `poem` (25), `speech` (2), `actio` (1), `letter` (1) |
|   3 | `div[@subtype='X']`                       |   145 | Container        | `section` (62), `chapter` (33), `scene` (26), `poem` (18), `letter` (4), `book` (2)                           |
|   4 | `l`                                       |    96 | Container        | Verse `line` (96)                                                                                             |
|   5 | `milestone[@unit='X']`                    |    13 | **Point**        | `card` (10, Seneca tragedies), `section` (3)                                                                  |
|   6 | `div1[@type='X']`                         |    12 | Container        | `book` (5), `poem` (3), `chapter` (2), `letter` (2)                                                           |
|   7 | `.//lb`                                   |    11 | **Point**        | `line` (11, Appendix Vergiliana)                                                                              |
|   8 | `.//l`                                    |    10 | Container        | `line` (10, Seneca tragedies under `milestone[@unit='card']`)                                                 |
|   9 | `div2[@type='X']`                         |     6 | Container        | `section` (3), `letter` (2), `chapter` (1)                                                                    |
|  10 | `div/div/div[@subtype='X']`               |     5 | Container        | `section` (3), `book` (1), `letter` (1)                                                                       |
|  11 | `.//milestone[@unit='X']`                 |     3 | **Point**        | `chapter` (2, Tacitus _Annales_), `section` (1)                                                               |
|  12 | `div[@type='X']`                          |     2 | Container        | `section` (2)                                                                                                 |
|  13 | `div/div[@subtype=book']`                 |     1 | Container (typo) | Missing opening quote on `'book'` (`phi0474.phi043.perseus-lat2`, _De Re Publica_)                            |
|  14 | `.//seg[@type='X']`                       |     1 | Container        | `section` (`phi0631.phi003.perseus-lat2`, Sallust)                                                            |
|  15 | `pb`                                      |     1 | **Point**        | `page` (`phi0959.phi010.perseus-lat2`, Ovid _Ibis_)                                                           |
|  16 | `div[@type]`                              |     1 | Container (typo) | Unconstrained `@type` (`phi0969.phi001.perseus-lat2`, Persius, for satires + prologue)                        |
|  17 | `.//div[@subtype='X']`                    |     1 | Container        | `fragment` (`phi1014.phi004.perseus-lat1`, Seneca the Elder _Fragmenta_)                                      |
|  18 | `l \| div2[@type='X']`                    |     1 | Union            | `line` or `section` (`stoa0261.stoa001.perseus-lat1`, Ausonius _Epistulae_)                                   |
|  19 | `div3[@type='X'] \| milestone[@unit='X']` |     1 | Union            | `section` container or milestone (`stoa0261.stoa002.perseus-lat1`, Symmachus _Epistulae_)                     |

### 2.1 Worked examples of `<citeStructure>` declarations

| Work                            | ID                              | Declared `<citeStructure>` hierarchy (`unit` ← `match`)                                                                   | V1 result today                                                      | What `<citeStructure>` resolves                                                                            |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Cicero, _Pro Sestio_ / _Topica_ | `phi0474.phi022` / `phi042`     | `section` ← `div/div[@subtype='section']` _(chapter milestones omitted)_                                                  | _Pro Sestio_ ✓ / _Topica_ fails ([INV-3](V1_PREPROCESSING.md#inv-3)) | Fixes _Topica_'s two-headed header; marks `chapter` milestones as undeclared secondary axis                |
| Cicero, _De Officiis_           | `phi0474.phi055.perseus-lat2`   | `book` ← `div/div[@subtype='book']` > `section` ← `div[@subtype='section']`                                               | ✓                                                                    | Confirms 2-level container spine; `chapter` milestones are secondary                                       |
| Seneca, _Medea_                 | `phi1017.phi004.perseus-lat2`   | `card` ← `milestone[@unit='card']` > `line` ← `.//l`                                                                      | Fails (no `textpart` divs)                                           | Declares point-based `card` level above `<l>` lines                                                        |
| Tacitus, _Annales_              | `phi1351.phi005.perseus-lat1`   | `book` ← `div1[@type='book']` > `chapter` ← `.//milestone[@unit='chapter']`                                               | Fails (`div1` + milestones)                                          | Declares `div1` container + milestone `chapter` spans                                                      |
| Symmachus, _Epistulae_          | `stoa0261.stoa002.perseus-lat2` | `book` ← `div1[@type='book']` > `letter` ← `div2[@type='letter']` > `section` ← `.//milestone[@unit='section']`           | Fails (`div1`/`div2` + milestones)                                   | 2 container levels + 1 point level                                                                         |
| Appendix Vergiliana, _Dirae_    | `phi0692.phi003.perseus-lat1`   | `line` ← `.//lb`                                                                                                          | Fails (no divs)                                                      | Point-based `<lb>` line spine                                                                              |
| Plautus, _Amphitruo_            | `phi0119.phi001.perseus-lat2`   | `act` ← `div/div[@subtype='act']` > `scene` ← `div[@subtype='scene']` > `line` ← `l`                                      | Fails ([INV-1](V1_PREPROCESSING.md#inv-1): 2 non-CTS `refsDecl`)     | Replaces ambiguous `refsDecl` with single 3-level hierarchy                                                |
| Terence, _Andria_               | `phi0134.phi001.perseus-lat2`   | `act` ← `div/div[@subtype='act']` (with `line` ← `l` for prologue _and_ `scene` ← `div[@subtype='scene']` > `line` ← `l`) | Fails ([INV-1](V1_PREPROCESSING.md#inv-1) + ragged depth)            | Explicitly declares ragged depth (prologue has lines directly under `act`; acts 1–5 have `scene` > `line`) |
| Historia Augusta                | `phi2331.phi001`–`030`          | `chapter` ← `div/div[@subtype='chapter']` _(section milestones omitted)_                                                  | Fails ([INV-3](V1_PREPROCESSING.md#inv-3) `work` level)              | Drops the unrepresented `work` collection level; `section` milestones become secondary axis                |

---

## 3. Re-editioned and renamed works

Upstream replaced `-lat1` files with `-lat2` (or `-lat3`/`-lat4` for _De Divinatione_) across 25 works and renamed two `stoa0261` work directories. In every `-lat1` → `-lat2` replacement, **the editor is identical** — the URN was bumped as part of the EpiDoc/CapiTainS review pass.

### 3.1 The 15 onboarded works whose `-lat1` files were replaced

All 15 must be updated in [`library_constants.ts`](../../library_constants.ts) and aliased in the reader work-ID redirect table so existing URLs and saved bookmarks continue to resolve:

| `LatinWorks` key                   | Old ID (deleted upstream)     | New ID (upstream HEAD)        | Work                                | Editor(s)               | Nature of text / markup changes                                                                                                              |
| ---------------------------------- | ----------------------------- | ----------------------------- | ----------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `CICERO_DE_INVENTIONE`             | `phi0474.phi036.perseus-lat1` | `phi0474.phi036.perseus-lat2` | _De Inventione_                     | Eduard Stroebel         | Header/EpiDoc normalisation, `xml:base`, Beta Code Greek → Unicode, de-hyphenation, `p rend="align(indent)"` _(no `citeStructure` yet)_      |
| `CICERO_DE_ORATORE`                | `phi0474.phi037.perseus-lat1` | `phi0474.phi037.perseus-lat2` | _De Oratore_                        | Augustus Samuel Wilkins | Same (`phi036`–`phi041` rhetorica batch; no `citeStructure` yet)                                                                             |
| `CICERO_DE_PARTITIONE_ORATORIA`    | `phi0474.phi038.perseus-lat1` | `phi0474.phi038.perseus-lat2` | _Partitiones Oratoriae_             | Augustus Samuel Wilkins | Same; in `FORCE_CTS_WORKS`                                                                                                                   |
| `CICERO_BRUTUS`                    | `phi0474.phi039.perseus-lat1` | `phi0474.phi039.perseus-lat2` | _Brutus_                            | Augustus Samuel Wilkins | Same; in `FORCE_CTS_WORKS`                                                                                                                   |
| `CICERO_ORATOR`                    | `phi0474.phi040.perseus-lat1` | `phi0474.phi040.perseus-lat2` | _Orator_                            | Augustus Samuel Wilkins | Same; in `FORCE_CTS_WORKS`                                                                                                                   |
| `CICERO_DE_OPTIMO_GENERE_ORATORUM` | `phi0474.phi041.perseus-lat1` | `phi0474.phi041.perseus-lat2` | _De Optimo Genere Oratorum_         | Augustus Samuel Wilkins | Same; in `FORCE_CTS_WORKS`                                                                                                                   |
| `CICERO_DE_RE_PUBLICA`             | `phi0474.phi043.perseus-lat1` | `phi0474.phi043.perseus-lat2` | _De Re Publica_                     | C. F. W. Müller         | Header/EpiDoc cleanup, `citeStructure` added (has `match` quote typo `div/div[@subtype=book']`), Unicode Greek, de-hyphenation               |
| `CICERO_LUCULLUS`                  | `phi0474.phi046.perseus-lat1` | `phi0474.phi046.perseus-lat2` | _Lucullus_ (_Academica Posteriora_) | Otto Plasberg           | Header/EpiDoc cleanup, `citeStructure` added, Unicode Greek, de-hyphenation                                                                  |
| `CICERO_DE_FINIBUS`                | `phi0474.phi048.perseus-lat1` | `phi0474.phi048.perseus-lat2` | _De Finibus Bonorum et Malorum_     | Theodor Schiche         | Front/back matter and unnumbered `<div subtype="index">` removed (eliminates the spurious "Book index" page), `citeStructure`, Unicode Greek |
| `CICERO_DE_SENECTUTE`              | `phi0474.phi051.perseus-lat1` | `phi0474.phi051.perseus-lat2` | _Cato Maior de Senectute_           | W. A. Falconer          | Header/EpiDoc cleanup, `citeStructure` added, Unicode Greek, typo fixes                                                                      |
| `CICERO_DE_FATO`                   | `phi0474.phi054.perseus-lat1` | `phi0474.phi054.perseus-lat2` | _De Fato_                           | C. F. W. Müller         | Revised section breaks, adds ~400-word _Argumentum_ (`div subtype="argument"`), `citeStructure`, Unicode Greek                               |
| `CICERO_DE_OFFICIIS`               | `phi0474.phi055.perseus-lat1` | `phi0474.phi055.perseus-lat2` | _De Officiis_                       | Walter Miller           | Revised section breaks where errors were evident, `citeStructure`, `p rend="align(indent)"`, Unicode Greek                                   |
| `CICERO_TIMAEUS`                   | `phi0474.phi072.perseus-lat1` | `phi0474.phi072.perseus-lat2` | _Timaeus_                           | C. F. W. Müller         | Header/EpiDoc cleanup, `citeStructure` added, Unicode Greek                                                                                  |
| `TACITUS_AGRICOLA`                 | `phi1351.phi001.perseus-lat1` | `phi1351.phi001.perseus-lat2` | _Agricola_                          | Henry Furneaux          | Fixed incorrect section and chapter breaks, `citeStructure`, `xml:base`, EpiDoc schema                                                       |
| _(commented out in `LatinWorks`)_  | `phi0474.phi045.perseus-lat1` | `phi0474.phi045.perseus-lat2` | _Academica_                         | Otto Plasberg           | Removed unused front/back matter (including the `<cell>` table in the preface), `citeStructure` added                                        |

> [!NOTE]
> The Phase 0 brief (`PHASE0_CONTEXT.md`) lists 15 `-lat1` → `-lat2` IDs: the 14 active `LatinWorks` entries above plus `phi0474.phi045` (_Academica_, which is referenced in `library_constants.ts` comments and docs).

### 3.2 Other re-editioned and renamed works (not yet onboarded)

| Old ID(s)                                 | New ID(s)                                | Work                                   | Editor(s)                                           | Notes                                                                                |
| ----------------------------------------- | ---------------------------------------- | -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `phi0474.phi042.perseus-lat1`             | `phi0474.phi042.perseus-lat2`            | Cicero, _Topica_                       | A. S. Wilkins                                       | `<front>` SIGLA div removed; `citeStructure` declares `section`                      |
| `phi0474.phi047.perseus-lat1`             | `phi0474.phi047.perseus-lat2`            | Cicero, _Paradoxa Stoicorum_           | J. G. Baiter                                        | URN bumped, `citeStructure`, Unicode Greek                                           |
| `phi0474.phi049.perseus-lat1`             | `phi0474.phi049.perseus-lat2`            | Cicero, _Tusculanae Disputationes_     | Max Pohlenz                                         | Unused front/back matter removed, `citeStructure`                                    |
| `phi0474.phi050.perseus-lat1`             | `phi0474.phi050.perseus-lat2`            | Cicero, _De Natura Deorum_             | Otto Plasberg                                       | URN bumped, `citeStructure`                                                          |
| `phi0474.phi053.perseus-lat1`, `-lat2`    | `phi0474.phi053.perseus-lat3`, `-lat4`   | Cicero, _De Divinatione_               | C. F. W. Müller (`-lat3`), W. A. Falconer (`-lat4`) | Both `-lat1` and `-lat2` replaced by `-lat3` and `-lat4`; section breaks revised     |
| `phi0474.phi056.perseus-lat1`             | `phi0474.phi056.perseus-lat2`            | Cicero, _Epistulae ad Familiares_      | L. C. Purser                                        | Reformatted fragments, `citeStructure`                                               |
| `phi0474.phi057.perseus-lat1`             | `phi0474.phi057.perseus-lat2`            | Cicero, _Epistulae ad Atticum_         | L. C. Purser                                        | Restored >30 missing sections and hundreds of Greek words lost between P4 and GitHub |
| `phi0474.phi058.perseus-lat1`             | `phi0474.phi058.perseus-lat2`            | Cicero, _Epistulae ad Quintum Fratrem_ | L. C. Purser                                        | Header/encoding cleanup, `citeStructure`                                             |
| `phi0474.phi059.perseus-lat1`             | `phi0474.phi059.perseus-lat2`            | Cicero, _Epistulae ad Brutum_          | L. C. Purser                                        | Header/encoding cleanup, `citeStructure`                                             |
| `phi1056.phi001.perseus-lat1`             | `phi1056.phi001.perseus-lat2`            | Vitruvius, _De Architectura_           | Fritz Krohn                                         | Converted to TEI P5 / EpiDoc, URN bumped _(no `citeStructure` yet)_                  |
| `stoa0261.stoa0001.perseus-lat1`          | `stoa0261.stoa001.perseus-lat1`          | Ausonius, _Epistulae_                  | H. G. Evelyn-White                                  | Directory/ID zero-padding removed (`stoa0001` → `stoa001`)                           |
| `stoa0261.stoa0002.perseus-lat1`, `-lat2` | `stoa0261.stoa002.perseus-lat1`, `-lat2` | Symmachus, _Epistulae_                 | Otto Seeck                                          | Directory/ID zero-padding removed (`stoa0002` → `stoa002`)                           |

---

## 4. Livy slices removal and the four `phi0914.phi001` editions

Upstream deleted all 67 per-book, periochae, and fragment slice files under `data/phi0914/phi0011`…`phi00145` and `phi001fr` (47 Latin `.xml` files plus English translations and tracking files), consolidating _Ab Urbe Condita_ under `data/phi0914/phi001/` with **four editions**:

| Edition ID                    | Editor(s)                                           | Coverage (`subtype="book"` divs)                                        |    Size | Notes                                                                                                                             |
| ----------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------- |
| `phi0914.phi001.perseus-lat2` | W. Weissenborn & M. / H. J. Müller (Teubner)        | **177 divs**: Books 1–10, 21–45 + Periochae (`1s`–`45s`, `46`–`142`)    | 7.29 MB | **What we ship today (`LIVY_AUC`).** Has 5 `<div type="part">` wrappers and 3 `index` divs; 0 notes; aligned with `perseus-eng3`. |
| `phi0914.phi001.perseus-lat3` | R. S. Conway, C. F. Walters, S. K. Johnson (OCT)    | **20 books**: Books 1–10, 21–30                                         | 4.68 MB | Clean `book/chapter/section` `textpart` divs; 1,791 apparatus notes.                                                              |
| `phi0914.phi001.perseus-lat4` | B. O. Foster, F. G. Moore, A. C. Schlesinger (Loeb) | **31 divs**: Books 1–5, 8–10, Periochae `11s`–`20s`, Books 21–30, 43–45 | 5.95 MB | Clean `book/chapter/section` `textpart` divs; 7,532 notes (missing Books 6–7, 31–42).                                             |
| `phi0914.phi001.perseus-lat5` | W. Weissenborn & H. J. Müller                       | **15 books**: Books 31–45                                               | 3.01 MB | Clean `book/chapter/section` `textpart` divs; 1,428 notes (complements `-lat3`).                                                  |

**Policy (Open Question 7):** keep `LIVY_AUC` pinned to `phi0914.phi001.perseus-lat2` for the Phase 0 sync because it is the only single file covering all extant books and Periochae and because our English translation alignment (`phi0914.phi001.perseus-eng3`) is tuned to it. Evaluate pairing `-lat3` (OCT Books 1–10, 21–30) and `-lat5` (Books 31–45) with their critical notes in a later phase.

---

## 5. `rend`, licence, and XML prolog regularisation

Three mechanical changes across the upstream tree require code adjustments before pinning:

1. **`rend="align(indent)"` (silent regression risk).**
   Upstream mass-renamed `<p rend="indent">` to `<p rend="align(indent)">` across the reviewed files (`align(indent)` grew from 1,367 to **6,555 occurrences**; `indent` dropped from 6,897 to 6,396). In [`perseus_rends.ts`](../../perseus_rends.ts), `align(indent)` is listed in `KNOWN_REND` (so V1 does not throw) but **not** in `HANDLED_REND` (so [`work_preprocessor.ts`](../work_preprocessor.ts) emits no CSS class). Without adding `align(indent)` to `HANDLED_REND` and mapping it alongside `indent`, syncing would silently strip paragraph indentation from ~5,000 paragraphs. Upstream also introduced `head rend="align(center)"` (124 occurrences).
2. **Licence upgrade to CC BY-SA 4.0.**
   All 99 upstream files that carry a versioned `<licence>` tag specify Creative Commons Attribution-ShareAlike **4.0** International (the remaining 234 files omit a `<licence>` element in the header and inherit the repository's licence). [`work_preprocessor.ts`](../work_preprocessor.ts) currently hardcodes `"CC BY-SA 3.0"`. The pipeline should extract the licence from `<availability><licence>` when present, default to the repository's licence, and note when local patches have modified the source text (as CC BY-SA 4.0 requires).
3. **XML prolog and `<!DOCTYPE>` stripping.**
   Upstream replaced the legacy `<!DOCTYPE TEI.2 …>` declaration with EpiDoc `<?xml-model href="https://epidoc.stoa.org/schema/latest/tei-epidoc.rng" …?>` processing instructions in 314 of 334 files (only 20 files still carry a `<!DOCTYPE>`). [`process_library.ts`](../../process_library.ts) currently strips one exact `<!DOCTYPE>` string literal via `.replace()` and [`xml_utils.ts`](../../../xml/xml_utils.ts) asserts a single root element, so unrecognized prolog nodes or whitespace variants in `<!DOCTYPE>` fail parsing. General prolog stripping before `<TEI` replaces the exact-string hack.

---

## 6. Review-pass progress and policy conclusions

As detailed in [PLAN.md §5.2a](PLAN.md#52a-how-far-along-is-upstream-and-should-we-wait):

- **Automated `citeStructure` + `xml:base` pass (Pletcher):** complete on **326 / 334** files (97.6%).
- **Manual per-textgroup deep review (Cerrato):** complete on **83 / 334** files (2026 monthly cadence: Jan 5, Mar 11, Jun 35, Jul 10, Aug 7, Sep 13, Oct 1 — averaging ~8 files/month, 35 at peak). Textgroups already reviewed include Cicero, Suetonius, and Tacitus; ~250 files (including Historia Augusta, Ausonius, Nepos, Plautus, Claudian, Seneca, Appendix Vergiliana, Ovid) remain and will take **1.5–3 years** at current pace.

### Policy

1. **Sync monthly behind tooling.** Do not wait for the manual review pass to finish. Run `./morcus.sh library survey` and `./morcus.sh library render` / `diff` on each upstream sync so any URN bump, markup change, or section-break revision surfaces as an explicit diff before the pin in [`upstream_sources.lock.json`](../../../../../upstream_sources.lock.json) is updated.
2. **Maintain a work-ID alias table.** Whenever an upstream review bumps a URN (`-lat1` → `-lat2`) or renames a work directory (`stoa0001` → `stoa001`), add the old → new mapping to the reader's alias table so existing URLs, links, and user state resolve transparently.
3. **Send fixes upstream as PRs, never carry fork commits.** Upstream actively merges small fixes. Our 3 local typo commits on `morcus-user-typos`, as well as source markup typos uncovered by the census (`p@inddent`, `quote@bockquote`, `quote@align(blockquote`, `div/div[@subtype=book']`, `alternatechpater`, `secton`, `chaper`), should be submitted as PRs to `PerseusDL/canonical-latinLit` so our fork can fast-forward cleanly to `upstream/master`.

---

## 7. Reproduction commands

The upstream comparison in `.investigation/library-preprocessing/upstream_diff.sh` can be reproduced from a `canonical-latinLit` checkout with the `upstream` remote (`https://github.com/PerseusDL/canonical-latinLit.git`) fetched:

```bash
cd "$LIB_XML_ROOT"
MB=$(git merge-base HEAD upstream/master)

# 1. Commit counts and file status summary between merge-base and upstream/master
git rev-list --left-right --count "$MB...upstream/master"
git diff --name-status "$MB" upstream/master | grep 'perseus-lat.*\.xml$'

# 2. Inspect structural/header summary of old vs new editions for a work
struct() {
  git show "$1" 2>/dev/null | python3 -c '
import sys, re
x = sys.stdin.read()
body = x[x.find("<body"):] if "<body" in x else x
refs = re.findall(r"<refsDecl[^>]*n=\"([^\"]*)\"", x)
units = re.findall(r"<refState[^>]*unit=\"([^\"]*)\"", x)
crefs = re.findall(r"<cRefPattern[^>]*n=\"([^\"]*)\"", x)
cs = re.findall(r"<citeStructure[^>]*unit=\"([^\"]*)\"", x)
divs = {}
for m in re.finditer(r"<div[^>]*type=\"([^\"]*)\"(?:[^>]*subtype=\"([^\"]*)\")?", body):
    divs[(m.group(1), m.group(2))] = divs.get((m.group(1), m.group(2)), 0) + 1
ms = {}
for m in re.finditer(r"<milestone[^>]*unit=\"([^\"]*)\"", body):
    ms[m.group(1)] = ms.get(m.group(1), 0) + 1
tags = {}
for m in re.finditer(r"<([a-zA-Z][\w:]*)", body):
    tags[m.group(1)] = tags.get(m.group(1), 0) + 1
print(f"  refsDecl={refs} refState={units} cRef={crefs} citeStructure={cs}")
print("  divs=", {f"{k[0]}/{k[1]}": v for k, v in divs.items()})
print(f"  milestones={ms} notes={tags.get(\"note\", 0)} sp={tags.get(\"sp\", 0)} tags={len(tags)} bytes={len(x)}")
'
}

for w in phi0474/phi041/phi0474.phi041 phi0474/phi042/phi0474.phi042 \
         phi0474/phi055/phi0474.phi055 phi0474/phi045/phi0474.phi045 \
         phi0474/phi056/phi0474.phi056 phi1351/phi001/phi1351.phi001; do
  echo "## $w"
  echo " old lat1:"; struct "$MB:data/$w.perseus-lat1.xml"
  echo " new lat2:"; struct "upstream/master:data/$w.perseus-lat2.xml"
done

# 3. Compare the four Livy phi0914.phi001 editions on upstream/master
for n in 2 3 4 5; do
  echo "Livy lat$n:"
  struct "upstream/master:data/phi0914/phi001/phi0914.phi001.perseus-lat$n.xml"
done

# 4. Enumerate all normalized <citeStructure match="..."> patterns across upstream/master
git ls-tree -r --name-only upstream/master data/ | grep -E 'perseus-lat[0-9]*\.xml$' | while read -r f; do
  git show "upstream/master:$f" | grep -oE '<citeStructure[^>]*match="[^"]*"'
done | sed -E 's/.*match="([^"]*)".*/\1/; s/'\''[^'\'']*'\''/'\''X'\''/g' | sort | uniq -c | sort -nr
```
