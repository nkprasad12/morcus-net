# Morceus TODOs

Data, ending-table, and analyzer correctness follow-ups.

## 1. Ending Table & Nominal Stem Audits

### 1.1 Migrate Greek `-ēs, -is` personal names off `es_is.end`

`morceus-data/latin/ends/target/es_is.end` includes `ea masc acc sg` and `@decl3_i masc fem` (meant for Latin 3rd-declension nouns and `-clēs`/`-eus` forms), which overgenerates invalid forms like `*Aristīdium`, `*Aristīdīs`, and `*Aristīdea` on non-`-clēs` masculine names.

`Aristides` has been moved to `es_is_greek.end` (`:no:A^risti_d es_is_greek masc`). Remaining `es_is` stems in `morceus-data/latin/stems/nominals/ls.nom` should be audited and split cleanly (and `:aj:` corrected to `:no:` on nouns):

- **`-idēs` / `-adēs` personal names → `es_is_greek`:** e.g. `Alcibiades`, `Euripides`, `Miltiades`, `Simonides`, `Thucydides`, `Achaemenides`, `Acmonides`, `Bacchylides`, etc.
- **Greek s-stem names (`-cratēs`, `-phanēs`, `-sthenēs`, `-mēdēs`, etc., like `Socrates`, `Aristophanes`, `Demosthenes`, `Archimedes`):** acc `-em`/`-ēn` and voc `-ēs`/`-ē`/`-e` (e.g. `Sōcrate`), without `-ea`; route to `es_is_greek` or a dedicated s-stem variant supporting short `-e` vocative.
- **`-clēs` names → dedicated `-clēs` table:** e.g. `Damocles`, `Androcles`, `Agathocles`, etc., which legitimately take `-ea` (like _Periclea_) and `-ī` alongside `@decl3`.
- Audit `ea masc acc sg` in `es_is.end` so masculine non-`-clēs` `es_is` stems (`acinaces`, `Arsaces`, etc.) stop generating `-ea`.

### 1.2 Audit `decl2.end` neuter vocative (`e voc sg`)

`morceus-data/latin/ends/dependency/decl2.end` line 8 has `e voc sg` without a `masc fem` gender filter, generating bogus neuter vocatives like `*ātrāmente` (`atramentum`) and `bone` tagged `neut voc sg`. Restrict it to `e voc sg masc fem` (keeping masc `e`, since e.g. `puere` is attested in Plautus) and audit `decl2` callers (`us_i`, `us_a_um`, `er_ra_rum`, etc.).

### 1.3 Vocative gaps on ending tables (including `es_eLdis.end`)

See [src/web/ui/corpus/TODOS.md §4.8](../web/ui/corpus/TODOS.md#48-no-vocative-for-nouns-on-the-es_eldis-ending-table): `es_eLdis.end` (e.g. `merces#1`) lacks `voc`, and other ending tables should be audited for missing vocatives.

### 1.4 Enforce `no_comp` in `mergeIfCompatible`

`no_comp` is parsed into `INTERNAL_TAGS` in `src/morceus/inflection_data_utils.ts`, but `mergeIfCompatible` in `src/morceus/crunch.ts` does not check it. As a result, adjectives tagged `no_comp` (such as `bonus`/`magnus`, whose comparatives are irregular) still generate regular comparatives/superlatives (`*bonior`), and adjectives like `imberbis`/`imberbus` generate `*imberbior`/`*imberbissimus`. Enforce `no_comp` in `crunch.ts` and audit adjectives like `imberbis` that shouldn't compare.

## 2. Verb Stem & Contraction Audits

### 2.1 `con-` orth stems for `commoveo` (and `commo-` variants)

`commoveo` now has `:vs:con-mo_ mov_contr_perf orth` (covering Horace _Sat._ 2.1.45 `conmorit`), but its uncontracted stems (`conj2`, `perfstem`, `pp4`) in `vbs.latin` still only list `com-mo*` without `con-mo*` orth variants.

### 2.2 Syncopated `surgo` forms and `voveo` / `foveo`

- L&S `surgo` (`n47035`) cites syncopated perfects `surrexti`, `surrexe`, and archaic `surregit` (Festus), which are not yet in `vbs.latin.bas`.
- Audit `foveo` / `voveo` (and their compounds) for any attested `-ō-` contracted perfect forms.
