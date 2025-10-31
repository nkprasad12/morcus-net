mod autocompleter;
mod match_finder;
mod stem_and_irreg_ranges;
mod string_utils;

use crate::{
    completions::{
        autocompleter::Addenda,
        match_finder::MatchFinder,
        stem_and_irreg_ranges::{PrefixRanges, compute_ranges},
        string_utils::{display_form, normalize_key},
    },
    indices::{CruncherTables, InflectionEnding, IrregularForm, Lemma, Stem},
};

/// The main entry point for completions.
pub struct Autocompleter<'a> {
    tables: &'a CruncherTables,
    addenda: Addenda<'a>,
}

impl<'a> Autocompleter<'a> {
    /// The intended public constructor for the Autocompleter.
    pub fn new(tables: &'a CruncherTables) -> Result<Autocompleter<'a>, AutocompleteError> {
        Autocompleter::make_from(tables)
    }

    /// The main API for fetching completions.
    ///
    /// # Arguments
    /// * `prefix` - The prefix to complete, case-insensitive. This should
    ///   contain only ascii characters.
    /// * `limit` - The maximum number of completions to return.
    pub fn completions_for(
        &'a self,
        prefix: &str,
        limit: usize,
    ) -> Result<Vec<LemmaResult<'a>>, AutocompleteError> {
        MatchFinder::for_prefix(prefix, self)?.completions(limit)
    }
}

pub enum AutocompleteResult<'a> {
    Stem(StemResult<'a>),
    Irreg(IrregResult<'a>),
}

pub struct LemmaResult<'a> {
    pub lemma: &'a Lemma,
    pub stems: Vec<StemResult<'a>>,
    pub irregs: Vec<IrregResult<'a>>,
}

pub struct IrregResult<'a> {
    pub irreg: &'a IrregularForm,
    pub irreg_id: usize,
}

pub struct StemResult<'a> {
    stem: &'a Stem,
    ends: Vec<&'a InflectionEnding>,
    pub stem_id: usize,
}

impl<'t> StemResult<'t> {
    // Expands the results for a stem into full results with endings.
    pub fn expand(&self) -> impl Iterator<Item = SingleStemResult<'t>> + '_ {
        self.ends.iter().map(|ending| SingleStemResult {
            stem: self.stem,
            ending,
        })
    }
}

pub struct SingleStemResult<'a> {
    pub stem: &'a Stem,
    pub ending: &'a InflectionEnding,
}

// We can use a more sophisticated error type later if needed.
pub type AutocompleteError = String;

pub struct DisplayOptions {
    /// Whether to show breves in the display. Macra are always shown.
    pub show_breves: bool,
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
