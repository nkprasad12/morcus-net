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

impl IrregularForm {
    fn display_form(&self, options: &DisplayOptions) -> String {
        display_form(&self.form, options)
    }
}

impl SingleStemResult<'_> {
    fn display_form(&self, options: &DisplayOptions) -> String {
        let mut end = self.ending.ending.to_string();
        if end == "*" {
            end = "".to_string();
        }
        display_form(&format!("{}{}", &self.stem.stem, end), options)
    }
}

fn display_form(input: &str, options: &DisplayOptions) -> String {
    let breve_mark = if options.show_breves { "\u{0306}" } else { "" };
    input
        .replace(['-', '+'], "")
        .replace('^', breve_mark)
        .replace('_', "\u{0304}")
}

impl AutocompleteResult<'_, '_> {
    /// Returns an iterator over all possible matching forms for this lemma.
    pub fn iterate_matches(
        &self,
        max_per_stem: Option<usize>,
    ) -> impl Iterator<Item = SingleResult> + '_ {
        let irreg_results = self.irregs.iter().map(|irreg| SingleResult {
            form: irreg.display_form(self.display_options),
            context: irreg.context.clone(),
            stem: None,
        });

        let max_per_stem = max_per_stem.unwrap_or(usize::MAX);
        let stem_results = self.stems.iter().flat_map(move |stem_result| {
            stem_result
                .expand()
                .filter_map(|single_stem| {
                    merge_stem_and_ending(single_stem.stem, single_stem.ending).map(|context| {
                        SingleResult {
                            form: single_stem.display_form(self.display_options),
                            context,
                            stem: Some(single_stem.stem.stem.clone()),
                        }
                    })
                })
                .take(max_per_stem)
        });

        irreg_results.chain(stem_results)
    }
}
