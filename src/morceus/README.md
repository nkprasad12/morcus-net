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

- Morpheus only returns `dative` as an option for supine, though typically grammar books call it `ablative`
- Morpheus doesn't ever say anything is `locative`
- Morpheus doesn't have some of the orthographic variants in Lewis and Short (for example, `canaba` is there but not `cannaba`)
- Morpheus probably doesn't have some of the entries that I split
- Outputs are somewhat clunky and have some overlap (might have `nom` and on a separate line `nom/acc/voc`)
- Support Greek declensions fully if these are not already done
- there's no concept of deponents (i.e loquuntur gives `verb 3rd pl pres ind pass`)
- there's no concept of impersonal-only (i.e `licemus` returns results for licet)
- idem, quidam, etc... are stated to be "indeclinable".
- the tables don't give any analysis for periphrastics (future active / passive infinitives, perfect passive conjugations)

### Unknowns

- Why do some of the `endtables` have `L` in the title? (A: I think because those mark long vowels)
- Why do some of the `endtables` have `0`? (A: I think 0 is meant to be the empty or null string)
- How exactly are `steminds` generated?

### TODO

Looking at output for ax_adj
- `a_cissime ax_adj masc/neut voc superl sg` -> Surely this should not include neuter???
