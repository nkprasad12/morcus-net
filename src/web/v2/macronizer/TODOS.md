# Macronizer TODOs (`src/web/v2/macronizer/`)

Known follow-up work and optimization candidates for the UI V2 Macronizer slice. See [`README.md`](README.md) and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for architecture details.

---

## 1. Lowercase all-caps tokens before sending them to LatinCy

**Status:** open.

All-caps input wrecks tags for the whole sentence (e.g. `DA`/`MIHI` tagged NUM, lemmas like `iMMORTALES`), while the same sentence lowercased tags correctly. Lowercase all-caps tokens before sending them to LatinCy.

Side note: sentence-initial `I` always shows the "possible Roman numeral" flag now; that's noisy but honest.

---

## 2. Known words lose user-typed long marks

**Status:** open question.

Morceus looks words up with diacritics removed, and a known word is shown with Morceus's forms, so anything the user typed is dropped: `Ōthō` comes back as `Othō` when Morceus marks only the final vowel, and `poëtae` loses its diaeresis. Unknown words keep the typed spelling. Options: prefer forms whose long vowels include the typed ones, or treat typed macrons as an edit.

---

## 3. Fake tagger can't express perfect and future perfect

**Status:** minor, affects the `fake-latincy` engine only.

`wordInflectionDataToUd` serializes Morceus inflections to UD features for the fake tagger, but `convertUpos` reads `Tense=Past|Aspect=Perf` as pluperfect, so perfect and future perfect forms are serialized as `Aspect=Perf` alone. Their simulated suggestions are weaker than they should be.

---

## 4. SSR HTML payload size for long passages

**Status:** measured 2026-10-02 at the 10,000-character limit, with the `fake-latincy` engine and the real Morceus tables.

| Passage (10k chars)                           | Words (plain / other) |   Raw HTML | Gzipped (level 9) | Indentation share |
| :-------------------------------------------- | :-------------------- | ---------: | ----------------: | ----------------: |
| Realistic (`dcc_dbg` golden, macrons removed) | 1,408 (1,211 / 197)   | 1,020.2 KB |           72.1 KB |             18.5% |
| Stress (ambiguous words only, repeated)       | 1,619 (1 / 1,618)     | 6,287.5 KB |          251.8 KB |             24.6% |

### Findings

- Most of the raw weight is the per-word `<details class="mac-card" id="wN">` inspector cards for non-plain words, particularly the per-vowel checkbox pills. The tier-0 plain words are a small share.
- Template indentation is roughly a fifth of the raw bytes; it compresses well but still costs parse time.

### Potential optimizations

- Strip template indentation from the card markup.
- Lazy-render the `<details class="mac-edit">` vowel-override strip in JS while keeping it server-rendered for No-JS, or only for tiers 1–3 and 5.
- Consider omitting `open` on tier-4 cards in No-JS so long passages scan as one-line summaries.

---

## 5. Tighten bundle size budgets once stabilized

**Status:** generous ceilings set in [`src/bundler/v2_bundle_budget.ts`](../../../bundler/v2_bundle_budget.ts) during initial implementation.

- Tighten `V2_BUNDLE_BUDGET.chunks["macronizer.js"]`, `V2_BUNDLE_BUDGET.routes.macronizer`, and `maxCssRawBytes` / `maxCssGzipBytes` to about 15% above the measured production sizes once visual polish settles.
