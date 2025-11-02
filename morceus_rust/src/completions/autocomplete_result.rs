use crate::{
    completions::{AutocompleteResult, DisplayOptions, SingleResult},
    indices::{InflectionEnding, IrregularForm, Stem},
    stem_merging::merge_stem_and_ending,
};

pub(super) type IrregResult = IrregularForm;

pub(super) struct StemResult<'a> {
    pub(super) stem: &'a Stem,
    pub(super) ends: Vec<&'a InflectionEnding>,
}

struct SingleStemResult<'a> {
    stem: &'a Stem,
    ending: &'a InflectionEnding,
}

impl<'t> StemResult<'t> {
    // Expands the results for a stem into full results with endings.
    fn expand(&self) -> impl Iterator<Item = SingleStemResult<'t>> + '_ {
        self.ends
            .iter()
            .filter(|e| merge_stem_and_ending(self.stem, e).is_some())
            .map(|ending| SingleStemResult {
                stem: self.stem,
                ending,
            })
    }
}

pub trait DisplayForm {
    fn display_form(&self, options: &DisplayOptions) -> String;
}

impl DisplayForm for IrregularForm {
    fn display_form(&self, options: &DisplayOptions) -> String {
        display_form(&self.form, options)
    }
}

impl DisplayForm for SingleStemResult<'_> {
    fn display_form(&self, options: &DisplayOptions) -> String {
        display_form(
            &format!("{}{}", &self.stem.stem, &self.ending.ending),
            options,
        )
    }
}

pub(super) fn display_form(input: &str, options: &DisplayOptions) -> String {
    let breve_mark = if options.show_breves { "\u{0306}" } else { "" };
    input
        .replace(['-', '+'], "")
        .replace('^', breve_mark)
        .replace('_', "\u{0304}")
}

impl AutocompleteResult<'_> {
    /// Returns matches for this lemma.
    pub(super) fn sample_matches(&self) -> Vec<SingleResult> {
        let mut results = Vec::new();
        for irreg in &self.irregs {
            results.push(SingleResult {
                form: irreg.display_form(&DisplayOptions { show_breves: false }),
                context: irreg.context.clone(),
                stem: None,
            });
        }
        for stem_result in &self.stems {
            for single_stem in stem_result.expand() {
                if let Some(context) = merge_stem_and_ending(single_stem.stem, single_stem.ending) {
                    results.push(SingleResult {
                        form: single_stem.display_form(&DisplayOptions { show_breves: false }),
                        context,
                        stem: Some(single_stem.stem.stem.clone()),
                    });
                    // Only include one ending per stem for the sample.
                    break;
                }
            }
        }
        results
    }
}
