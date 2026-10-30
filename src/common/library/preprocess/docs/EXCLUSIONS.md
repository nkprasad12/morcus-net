# Library Exclusion List

**Purpose:** The Phase 5 exit criterion in [PLAN.md](PLAN.md#phase-5--long-tail-and-policy) is "every distinct work onboarded or documented on the exclusion list." This file is that list: every Perseus Latin file in `canonical-latinLit` that is **not** in `LatinWorks` ([`library_constants.ts`](../../library_constants.ts)), with the reason.

**Source:** `canonical-latinLit@8b536bdf` (the pin when this list was made; Nepos _Cato_ was onboarded after re-pinning to `087c067`); survey `.cache/library-survey/8b536bdf-62a3f702/survey.json`; blockers are the survey's V1 result, plus the census ratchet ([`census_ratchet.test.ts`](../../audit/census_ratchet.test.ts)) where the survey has no detail.

**Summary:** 334 Perseus Latin files. 282 are onboarded (`LatinWorks`). The other **52** are listed here:

- **Group A — served elsewhere (43 files):** 19 served by Hypotactic, 12 by PHI JSON, and 12 superseded editions of works we already serve.
- **Group B — deferred (8 files):** distinct works not yet served, blocked on structure or markup support.
- **Group C — policy review (1 file):** Bede, held back on scope (post-classical), not on technical capability.

When a Group B or C work is onboarded, delete its row here, and remove it from `NOT_YET_ONBOARDED` in the census ratchet if it is listed there.

---

## Group A — served elsewhere (43 files)

### A.1 Served by Hypotactic (19 files)

Hypotactic serves these texts macronized and metrically scanned, so the Perseus file is not onboarded (Decision 5A-1; see [PLAN.md §4.5](PLAN.md#45-constraint-dont-strand-hypotactic-or-phi)).

| Work ID                       | Author  | Title              | Perseus editor        | Served as                                                                                |
| ----------------------------- | ------- | ------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `phi0690.phi001.perseus-lat2` | Vergil  | _Eclogae_          | J. B. Greenough       | `hypotactic_Eclogues_Vergil` (`/work/vergil/eclogues`)                                   |
| `phi0690.phi002.perseus-lat2` | Vergil  | _Georgica_         | J. B. Greenough       | `hypotactic_Georgics_Vergil` (`/work/vergil/georgics`)                                   |
| `phi0690.phi003.perseus-lat2` | Vergil  | _Aeneis_           | J. B. Greenough       | `hypotactic_Aeneid_Vergil` (`/work/vergil/aeneid`)                                       |
| `phi0893.phi001.perseus-lat2` | Horace  | _Carmina_          | Shorey & Laing        | `hypotactic_Odes_Horace` (`/work/horace/odes`), books 1–4                                |
| `phi0893.phi002.perseus-lat2` | Horace  | _Carmen Saeculare_ | Shorey & Laing        | `hypotactic_Odes_Horace`, page `4.16` (the work has 104 pages: 38 + 20 + 30 + 15 + _CS_) |
| `phi0893.phi003.perseus-lat2` | Horace  | _Epodi_            | Friedrich Vollmer     | `hypotactic_Epodes_Horace` (`/work/horace/epodes`)                                       |
| `phi0893.phi004.perseus-lat2` | Horace  | _Sermones_         | Christopher Smart     | `hypotactic_Sermones_Horace` (`/work/horace/sermones`)                                   |
| `phi0893.phi005.perseus-lat2` | Horace  | _Epistulae_        | H. Rushton Fairclough | `hypotactic_Epistulae_Horace` (`/work/horace/epistulae`)                                 |
| `phi0893.phi006.perseus-lat2` | Horace  | _Ars Poetica_      | Christopher Smart     | `hypotactic_Ars Poetica_Horace` (`/work/horace/ars_poetica`)                             |
| `phi0917.phi001.perseus-lat2` | Lucan   | _Pharsalia_        | Karl Hermann Weise    | `hypotactic_Bellum Civile_Lucan` (`/work/lucan/bellum_civile`)                           |
| `phi0959.phi005.perseus-lat2` | Ovid    | _Remedia Amoris_   | Rudolf Ehwald         | `hypotactic_Remedia Amoris_Ovid` (`/work/ovid/remedia_amoris`)                           |
| `phi0959.phi006.perseus-lat2` | Ovid    | _Metamorphoses_    | Hugo Magnus           | `hypotactic_Metamorphoses_Ovid` (`/work/ovid/metamorphoses`)                             |
| `phi0959.phi007.perseus-lat2` | Ovid    | _Fasti_            | J. G. Frazer          | `hypotactic_Fasti_Ovid` (`/work/ovid/fasti`)                                             |
| `phi0959.phi008.perseus-lat2` | Ovid    | _Tristia_          | A. L. Wheeler         | `hypotactic_Tristia_Ovid` (`/work/ovid/tristia`)                                         |
| `phi0959.phi010.perseus-lat2` | Ovid    | _Ibis_             | Rudolf Ehwald         | `hypotactic_Ibis_Ovid` (`/work/ovid/ibis`)                                               |
| `phi0969.phi001.perseus-lat2` | Persius | _Saturae_          | G. G. Ramsay          | `hypotactic_Satires_Persius` (`/work/persius/satires`)                                   |
| `phi1020.phi001.perseus-lat2` | Statius | _Thebais_          | J. H. Mozley          | `hypotactic_Thebaid_Statius` (`/work/statius/thebaid`)                                   |
| `phi1020.phi002.perseus-lat2` | Statius | _Silvae_           | J. H. Mozley          | `hypotactic_Silvae_Statius` (`/work/statius/silvae`)                                     |
| `phi1020.phi003.perseus-lat2` | Statius | _Achilleis_        | J. H. Mozley          | `hypotactic_Achilleid_Statius` (`/work/statius/achilleid`)                               |

> [!NOTE]
> Hypotactic does not label _Carmen Saeculare_: it appears as Odes `4.16` (page index 103, beginning _Phoebe silvarumque potens Diana_). A reader looking for it by title won't find it in the TOC. Fixing that is a Hypotactic-side labelling change, not a reason to onboard the Perseus file.

### A.2 Served by PHI JSON (12 files)

`phi-json-lat1348.001` (`/work/suetonius/de_vita_caesarum`, Ihm) ships all twelve lives, one TOC group each (`Jul` … `Dom`), so the per-life Perseus files (also Ihm) are not onboarded.

| Work ID                       | Author    | Title               | Perseus editor | Served as                        |
| ----------------------------- | --------- | ------------------- | -------------- | -------------------------------- |
| `phi1348.abo011.perseus-lat2` | Suetonius | _Divus Iulius_      | Maximilian Ihm | `phi-json-lat1348.001`, `Jul.*`  |
| `phi1348.abo012.perseus-lat2` | Suetonius | _Divus Augustus_    | Maximilian Ihm | `phi-json-lat1348.001`, `Aug.*`  |
| `phi1348.abo013.perseus-lat2` | Suetonius | _Tiberius_          | Maximilian Ihm | `phi-json-lat1348.001`, `Tib.*`  |
| `phi1348.abo014.perseus-lat2` | Suetonius | _C. Caligula_       | Maximilian Ihm | `phi-json-lat1348.001`, `Cal.*`  |
| `phi1348.abo015.perseus-lat2` | Suetonius | _Divus Claudius_    | Maximilian Ihm | `phi-json-lat1348.001`, `Cl.*`   |
| `phi1348.abo016.perseus-lat2` | Suetonius | _Nero_              | Maximilian Ihm | `phi-json-lat1348.001`, `Nero.*` |
| `phi1348.abo017.perseus-lat2` | Suetonius | _Galba_             | Maximilian Ihm | `phi-json-lat1348.001`, `Gal.*`  |
| `phi1348.abo018.perseus-lat2` | Suetonius | _Otho_              | Maximilian Ihm | `phi-json-lat1348.001`, `Otho.*` |
| `phi1348.abo019.perseus-lat2` | Suetonius | _Vitellius_         | Maximilian Ihm | `phi-json-lat1348.001`, `Vit.*`  |
| `phi1348.abo020.perseus-lat2` | Suetonius | _Divus Vespasianus_ | Maximilian Ihm | `phi-json-lat1348.001`, `Ves.*`  |
| `phi1348.abo021.perseus-lat2` | Suetonius | _Divus Titus_       | Maximilian Ihm | `phi-json-lat1348.001`, `Tit.*`  |
| `phi1348.abo022.perseus-lat2` | Suetonius | _Domitianus_        | Maximilian Ihm | `phi-json-lat1348.001`, `Dom.*`  |

### A.3 Superseded editions (12 files)

We serve one edition per work. These are the other editions of works we already serve.

| Work ID                         | Author    | Title                              | Editor                                       | We ship                                           | Reason                                                                                                             |
| ------------------------------- | --------- | ---------------------------------- | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `phi0448.phi002.perseus-lat3`   | Caesar    | _Bellum Civile_                    | A. G. Peskett (Loeb, 1914)                   | `-lat2` (du Pontet, OCT 1901)                     | We already ship the Oxford critical text; Peskett's Loeb text adds nothing.                                        |
| `phi0474.phi053.perseus-lat3`   | Cicero    | _De Divinatione_                   | C. F. W. Müller (Teubner, 1915)              | `-lat4` (Falconer, Loeb 1923)                     | Replaced in Phase 3. `-lat4` has more citable sections. `-lat3` stays in `WORK_ID_ALIASES` so old links resolve.   |
| `phi0631.phi001.perseus-lat3`   | Sallust   | _Catilina_                         | Axel W. Ahlberg (Teubner, 1919)              | `-lat4`                                           | Shipped edition. `-lat3` also fails V1: citation 53.1 occurs twice.                                                |
| `phi0631.phi002.perseus-lat3`   | Sallust   | _Iugurtha_                         | Axel W. Ahlberg (Teubner, 1919)              | `-lat4`                                           | Shipped edition. `-lat3` also fails V1: citation 3.1 occurs twice.                                                 |
| `phi0836.phi002.perseus-lat4`   | Celsus    | _De Medicina_                      | W. G. Spencer (Loeb, 1935–38)                | `-lat6` (Marx, Teubner 1915)                      | Marx is the standard critical edition. Onboarded in Phase 4.                                                       |
| `phi0836.phi002.perseus-lat5`   | Celsus    | _De Medicina_                      | C. V. Daremberg (Teubner, 1891)              | `-lat6` (Marx)                                    | Superseded by Marx. Also unhandled `<figure>` (it is in the census ratchet's `NOT_YET_ONBOARDED`).                 |
| `phi0914.phi001.perseus-lat3`   | Livy      | _Ab Urbe Condita_ 1–10, 21–30      | Conway, Walters & Johnson (OCT)              | `-lat2` (Weissenborn & Müller, Teubner 1884–1911) | `-lat2` covers every extant book (1–10, 21–45) plus the periochae. `-lat3` is partial and fails V1 (content node). |
| `phi0914.phi001.perseus-lat4`   | Livy      | _Ab Urbe Condita_ (Loeb selection) | B. O. Foster, F. G. Moore, A. C. Schlesinger | `-lat2`                                           | Partial (1–5, 8–10, 21–30, 43–45, periochae 11–20); fails V1 (content node).                                       |
| `phi0914.phi001.perseus-lat5`   | Livy      | _Ab Urbe Condita_ 31–45            | W. Weissenborn & H. J. Müller (Weidmann)     | `-lat2`                                           | Partial (31–45), same editors as `-lat2`; fails V1 (`titleStmt` has 7 titles).                                     |
| `phi0972.phi001.perseus-lat1`   | Petronius | _Satyricon_                        | Michael Heseltine (Loeb, 1913)               | `-lat2` (same edition)                            | Older encoding of the same text: milestones only, no `textpart` divs.                                              |
| `stoa0040.stoa011.perseus-lat1` | Augustine | _Epistulae_ (selections)           | J. H. Baxter (Loeb, 1930)                    | `-lat2` (same edition)                            | Older encoding of the same text: 62 sections against 274 in `-lat2`.                                               |
| `stoa0261.stoa002.perseus-lat2` | Sidonius  | _Epistulae_ 8–9                    | Christianus Luetjohann (MGH, 1887)           | `-lat1` (W. B. Anderson, Loeb 1936; books 1–9)    | Partial (books 8–9 only). `-lat1` has all nine books.                                                              |

---

## Group B — deferred: structure or markup support pending (8 files)

Distinct works with no other source in the library. Each is blocked on the V1 failure from the survey.

Three Ausonius files are deliberately deferred rather than fixed locally: each would need a new rule in the shared citation code for ~3,200 words in all, and Perseus's per-textgroup review has not reached Ausonius yet, so their structure is likely to change upstream.

| Work ID                         | Author           | Title                      | Editor             | Blocker                                                                                                                                                                                                                          |
| ------------------------------- | ---------------- | -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phi1014.phi002.perseus-lat1`   | Seneca the Elder | _Controversiae_ (excerpta) | A. G. Kiessling    | Structure: ragged citation depth, `book.chapter.section` against the declared `book.chapter` (also the upstream typo `subtype="chaper"`; see [UPSTREAM.md §6.1](UPSTREAM.md#61-pending-upstream-fixes))                          |
| `stoa0045.stoa002.perseus-lat2` | Ausonius         | _De XII Caesaribus_        | H. G. Evelyn-White | **Waiting on the Perseus review of Ausonius.** Book 1 (_Monosticha_) holds poems 1–4; poem 5 (_Tetrasticha_) sits outside any book and is split into sections (`praef`, 1–12), mixing `book.poem.line` with `poem.section.line`. |
| `stoa0045.stoa003.perseus-lat2` | Ausonius         | _Cento Nuptialis_          | H. G. Evelyn-White | **Waiting on the Perseus review of Ausonius.** The prose _Parecbasis_ is a section `<div>` with no `@n`, and the preface is double-wrapped (section `praef` > numbered `praeface n="pr"`, not a citation level).                 |
| `stoa0045.stoa016.perseus-lat2` | Ausonius         | _Epistulae_                | H. G. Evelyn-White | **Waiting on the Perseus review of Ausonius.** Section 22 holds numbered subsections `pr` (prose letter, `<p n>`) and `po` (the poem); the scheme declares only `section`.                                                       |
| `stoa0089.stoa001.perseus-lat2` | Claudian         | _Carmina Minora_           | Maurice Platnauer  | Structure: `div[@subtype='poem']` with no `@n`; ragged depth                                                                                                                                                                     |
| `stoa0089.stoa004.perseus-lat2` | Claudian         | _De Consulatu Stilichonis_ | Maurice Platnauer  | Structure: ragged citation depth, `book.poem.line` against the declared `book.line`                                                                                                                                              |
| `stoa0089.stoa008.perseus-lat2` | Claudian         | _In Eutropium_             | Maurice Platnauer  | Structure: missing citation level, `book.line` against the declared `book.poem.line`                                                                                                                                             |
| `stoa0261.stoa001.perseus-lat1` | Sidonius         | _Carmina_                  | W. B. Anderson     | Structure: `div2[@type='section']` with no `@n` under `l \| div2[@type='section']`; ragged depth                                                                                                                                 |

---

## Group C — policy review (1 file)

Held back on scope, not on technical capability: the open question is whether post-classical texts (Bede wrote in 731 AD) belong in the library. Technical blockers are listed for when that is decided.

| Work ID                         | Author | Title                                    | Editor          | Technical blockers (secondary)                                                     |
| ------------------------------- | ------ | ---------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `stoa0054.stoa006.perseus-lat1` | Bede   | _Historia Ecclesiastica Gentis Anglorum_ | Charles Plummer | Markup: `<argument>`, `<opener>`, `<closer>`, nested `<text>`; no `citeStructure`. |
