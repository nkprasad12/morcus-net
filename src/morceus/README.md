## Representing Words

Thoughts on overall design and how this works for Morpheus:

1. An _Inflected Form_ is a pair of _(Raw Word, Grammatical Data)_.
2. An _Inflection Rule_ is a function _f_ that maps a list of stems _S_ to a list of Inflected Forms _I_.
3. A _Word_ is a list of stems _S_ along with an _Inflection Rule_ compatible with those stems.
4. A _Lemma_ is one of the stems _S_ of a _Word_ conventionally used to identify a word.

Lemmata are not necessarily unique and thus are not really machine suitable. It's better to think of word IDs
which may have some additional disambiguation, like Perseus has in Lewis and Short (quis#1, quis#2, etc...)

But wait, it's actually more complicated than that. A word can also have variations in both stem and inflection rule.
For example:

- canaba has a variant cannaba, which has the same Inflection Rule (1st Declension) but has a different stem (canab- vs cannab-)
- cannabis has a variant cannabum, which has the same stem cannab- but has a different Inflection Rule (3rd Declension i-stem vs 2nd Declension neuter)

On top of that:

- nouns can have different grammatical properties too (for example, different takes Locative vs does not which is kind of reflection in the
  Inflection Rule but it also influences whether ab / ad are used or not)

## Morpheus

### Organization

Morpheus's `stemlib/Latin` has the following contents:

#### endtables

This is where all the endings are generated.

- The `basics` directory has things some of the very
  common primitives (like `decl1` for the basic rules of first declension, and so on.)
- In the `source` directory we have the checked in rule files that usually rely on the `basics` to
  define all the possible inflection types

Then there are generated files:

- `ascii` is for human readable expanded output (so if a endtable references one of the `basics`, this will be expanded out)
- `out` are binary files but probably the same output as `ascii`
- `indices` are collected data which list all possible endings according to the inflection rules, and for each ending lists which inflection rule generated it.

#### stemsrc

This is where all the stems are generated. Similar-ish story to above. There's a `camena` subdirectory which contains only one file with two elements.
Otherwise, we have lots of files in this directory though it's not fully clear how they are assembled. It seems to rely heavily on the `makefile` and on

The results are written out to the `steminds` directory to files `nomind` and `vbind` for nominals and verbs respectively.

#### derivs

`derivs` pull together stem and inflection class data, and are only used for verbs right now. For example, Latin `-īre` verbs are defined
in reference to `conj4` from the end tables etc... consult the docs for a full explanation here.

#### rule_files

These are also explained in the doc and are something of a registry for all the kinds of endings.

### Improvements

- Morpheus doesn't ever say anything is `locative`
- Morpheus doesn't have some of the orthographic variants in Lewis and Short (for example, `canaba` is there but not `cannaba`)
- Morpheus probably doesn't have some of the entries that I split
- Outputs are somewhat clunky and have some overlap (might have `nom` and on a separate line `nom/acc/voc`)
- Support Greek declensions fully if these are not already done
- there's no concept of deponents (i.e loquuntur gives `verb 3rd pl pres ind pass`)
- there's no concept of impersonal-only (i.e `licemus` returns results for licet)
- idem, quidam, etc... are stated to be "indeclinable".
- the tables don't give any analysis for periphrastics (future active / passive infinitives, perfect passive conjugations)

### Progress

- End table generation done and verified to match Morpheus 100% (modulo some errors in Morpheus)
- End index generation done and verified to match Morpheus 100%
- Stem index generation is in progress.
- The ending generation enginges have been updated to parse grammatical data
  rather than just leaving them as raw strings. The result has been validated
  still to match 1:1 the Morpheus end index output.

- Irregulars are parsed.
  There are a few key differences that all seem to be mistakes on the part of Morpheus:

1. Morceus preserves `orth` when a table is expanded, where Morpheus does not.
2. Morpheus re-assigns some stem types based on the values in `stemtypes.table` to the first
   on the list with the same code. For example, any `rel_pron` gets changed to `relative` because
   they are both listed with code `011`.

- Nom Stem Indices match barring some errors in Morpheus. Also, Morceus retains some data (but that's OK).
- Verb Stem Indices match barring some errors in Morpheus and maybe some weird stuff with the derivs.
- Cruncher mostly works and we added handling for initial case difference.
- We have manually created lists of compounds from Morpheus' buggy generation.

### Current work

- Implement and verify new tables we just added:
  - do_conj and fio_conj need to be worked on ?
- Fix the adsum issue!
  - We have :de:as sum_conj, which generates asest.
  - IT SHOULD NOT DO THIS!

### Longer term TODOs

- Auto-delete duplicates of exact copy lemmata [Not as important now that we can delete dupes]
- Figure out strategy for subset lemmata [Not as important now that we can delete dupes]
- Figure out strategy for substantive / adjective lemmata [Not as important now that we can delete dupes]
- Figure out strategy for duplicate lemma that differ only on a vowel length marking
  that is not contradictory (e.g. maxĭmus and maximus)

### Other important stuff before going live

- FIX DEPONENTS!!!!!!!!!!!!

- Figure out a strategy for linking to subentries

  - e.g. Romanus (http://localhost:5757/dicts/id/n41840#n41840.1) does not have its own entry
  - Likely candidate would be for orths that are not in the initial blurb, we should link these
    to the appropriate entry and just scroll down to the right subsection. This requires dictionary
    changes as well so it is annoying.

    - Currently in the LS parsing, we have a `rawOrths` function which only looks at orths that are
      direct children of the root.

      We can extend this to also include the children, but these should be marked with some data
      indicating that they're not in the root (probably the subsection containing it) so that we
      can differentiate these from top level orths.

- Figure out a strategy to consolidate entries. For example:

  ```
  hīs:

      fem dat pl
      fem abl pl
      masc dat pl
      masc abl pl
      neut dat pl
      neut abl pl
  ```

  could ideally just be collapsed to

  ```
  hīs:

    fem/masc/neut dat/abl pl
  ```

- Another dictionary issue: it seems the logic needs to be tuned. For example, when typing in `cum`,
  we get results for `cos` and `Cos` as well because `Cos` was (incorrectly) marked as potentially
  having an inflection `Cum` (should be `Coum`, but that's a separate problem).

  However, the point here is that `cos` has genetive `cotis` so this shouldn't even have pretended
  to be a match. Need to clean up this logic. It seems what happened was:

  1. Analyses for `Cum` returns the lemma `Cos`.
  2. Then, we returned results for `Cos` without verifying case.

Other nice to haves:

- Derank stub entries. For example, searching `maximum` gives the entry
  for `maximus` first which is just a stub that refers to `magnus`. However,
  the result also pulls up `magnus` anyways so we can just ignore this.
  - For this, we can likely save some metadata about the entry, e.g. whether
    it's a stub and if so where it points to. Then we can make the decision at
    query time about whether to return that result or not.

# Motivation for the V2

Things we want to fix:

## Deponents and friends

Currently, the tables are set up such that e.g. `loquor` will be claimed
to be `pres ind pass 1st sg dep` even though it's active.

We should probably check in on semi-deponents as well.

### Ideas

Deponents are usually marked already; we should make special tables
for these. We could also maybe run a corpus search to see if a word only ever shows up in "passive" forms to catch others that should be deponent, but also otherwise
if the lemma ends in "r" (and is a verb) that may be good enough?

## Locative

Morpheus tables never mark locative.

### Ideas

We need to go in and mark it where it can occur.

## Ambiguous Lemmata

It is hard to tell apart e.g. occido#1 from occido#2. Which is which?
It's non-trivial to tell because this is linked to the ordering within
L&S XML (not in the data file itself) so you actually need to consult to
repo to determine for sure.

### Ideas

We could add an optional `hint` field. For example,
`occido#1` could have `:hint:kill`. We could also display the principal parts,
for those where this is enough to distinguish.

## Dictionary codes

A common use case is that we will want to match up a lemma with its entry in
the dictionary (e.g. in Gaffiot or in Lewis and Short). This can have two
problems:

1. We may make a different decision on which variant is the core lemma form
   from a particular dictionary
2. For the `occido#1` vs `occido#2` example above, different dictionaries
   may mark those in different orders.

### Ideas

Include explicit dictionary codes for the ambiguous cases.
For we might have:

```
:le:occido#1
:dic:GAF occido2
```

## Principal parts

Getting the principal parts can be a bit annoying
First off, we never mark whether a lemma is a noun, adjective, or verb.
Even when this can be determined (with annoyance), we have things like deponents
or impersonals that can complicate this.

### Ideas

Have some metadata where we explicitly mark Noun / Adj / Verb and Dep / Semi / Imp
etc...

## Variants

On words where we can multiple orthograpical variants, we don't have a clean way to add different stems. For example:

```
:le:alluo
:vs:al-lu^	conj3
:vs:al-lu^ perfstem
:vs:ad-lu^  conj3 orth
:vs:ad-lu^  perfstem orth
```

This is bad because:

- We need to repeat everything where only prefix needs to change
- When generating tables, it is annoying to find which ones are "Primary"
- For words with multiple variants, it starts to get very messy very quickly.

## Derived terms

Examples: Adjectives can have neuter substantives that can be considered
lemmata in their own right, and same with verbs and their PPPs.

This causes problems where (a) the results get muddied with multiple
lemmata that are kind of the same thing and (b) when running statistical
analyses, sometimes we might want to match up e.g. a result that
returns a lemma `nascor` in PPP with `natus`. This also applies to corpus
strict mode.

### Ideas

Mark these relationships explicitly.

## Partial negated templates

Consider the lemma `ruo`

```
:le:ruo
:vs:ru^	conj3
:vs:ru^	perfstem
:vs:ru^t	pp4 no_fut_part
:vs:ru^i^t	pp4 fut part
```

The line `:vs:ru^i^t	pp4 fut part` gives us an easy way to say:
"include only the ends where the result has these tags" but we had
to invent a tag `no_fut_part` to specify the negation of that (e.g.
exclude only ...) which is annoying (we also have `no_fut`).

This also bites us when considering irregs (note that irregs have different logic
for lemma constructions, which is annoying)

```
:le:sal
:wd:sa_l	irreg_nom3 masc nom voc sg
sa^l@decl3	irreg_nom3 masc
```

## Periphrastics

Morpheus has been designed to go in one direction: it will take
in a single word, and give you the analyses for that word. This means
that periphrastics cannot be encoded in the tables.

### Ideas

Figure out a syntax for this, or whether we even need it. Can this be
encoded at table generation time instead?

# Design for V2

The encoding scheme would as follows:

:lemm: `str` matching /[A-Z]?[a-z]\*(?:[#]\d)?/ REQUIRED
:hint: `str` OPTIONAL
:type: `str` (must be valid `type_code`: noun, deponent, etc...) REQUIRED
:from: `str` (must be another lemma; where this is derived from) OPTIONAL
:dict: `str` (must be a valid `dict_code`) `str` OPTIONAL
