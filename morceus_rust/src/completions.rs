mod autocomplete_result;
mod autocompleter;
mod find_matches;
mod stem_and_irreg_ranges;
mod string_utils;

use crate::{
    completions::{
        autocomplete_result::{IrregResult, StemResult},
        autocompleter::Addenda,
        find_matches::completions_for_prefix,
    },
    indices::{CruncherTables, InflectionContext, Lemma},
};

static DEFAULT_OPTIONS: AutompleterOptions = AutompleterOptions {
    // All but ~15 3 letter prefixes have less than 250 completions.
    // If we hit the limit of 250, the result is still fast (< 100 us)
    // and only takes a few dozen kB of memory, so this is a reasonable
    // place to put the default.
    result_limit: 250,
    display_options: DisplayOptions { show_breves: false },
};

/// The main entry point for completions.
pub struct Autocompleter<'a, 'b> {
    tables: &'a CruncherTables,
    addenda: Addenda<'a>,
    options: &'b AutompleterOptions,
}

pub struct AutompleterOptions {
    pub result_limit: usize,
    pub display_options: DisplayOptions,
}

impl<'t, 'o> Autocompleter<'t, 'o> {
    /// Creates an autocompleter with default options.
    pub fn new(tables: &'t CruncherTables) -> Result<Autocompleter<'t, 'o>, AutocompleteError> {
        Autocompleter::new_with_options(tables, &DEFAULT_OPTIONS)
    }

    pub fn new_with_options(
        tables: &'t CruncherTables,
        options: &'o AutompleterOptions,
    ) -> Result<Autocompleter<'t, 'o>, AutocompleteError> {
        Ok(Autocompleter {
            tables,
            addenda: Autocompleter::make_addenda(tables)?,
            options,
        })
    }

    /// Convenience method for fetching completions with default options.
    pub fn completions_for(
        &'t self,
        prefix: &str,
    ) -> Result<Vec<AutocompleteResult<'t, 'o>>, AutocompleteError> {
        self.completions_with_options(prefix, self.options)
    }

    /// The main API for fetching completions.
    ///
    /// # Arguments
    /// * `prefix` - The prefix to complete, case-insensitive. This should
    ///   contain only ascii characters.
    /// * `limit` - The maximum number of lemmata to return. A single lemma may have multiple
    ///   inflected forms that match the prefix, but every lemma returned is guaranteed to have
    ///   at least one matching form.
    /// * `options` - Display options for formatting the output forms.
    ///
    /// # Returns
    /// A vector of lemmata with matching completion results.
    pub fn completions_with_options<'a>(
        &'t self,
        prefix: &str,
        options: &'a AutompleterOptions,
    ) -> Result<Vec<AutocompleteResult<'t, 'a>>, AutocompleteError> {
        completions_for_prefix(prefix, self, options.result_limit, &options.display_options)
    }
}

/// One completion result that represents all matching forms for a single lemma.
pub struct AutocompleteResult<'a, 'b> {
    lemma: &'a Lemma,
    stems: Vec<StemResult<'a>>,
    irregs: Vec<&'a IrregResult>,
    display_options: &'b DisplayOptions,
}

/// A single inflected result for a lemma.
pub struct SingleResult {
    // The display form of the word.
    pub form: String,
    // Data about the inflection of the word.
    pub context: InflectionContext,
    // The stem used to generate this form, if applicable.
    pub stem: Option<String>,
}

impl AutocompleteResult<'_, '_> {
    /// The readable name for this lemma.
    ///
    /// Note that this is not macronized, and that for lemmata
    /// where multiple forms have the same ASCII representation,
    /// this may be appended by a disambiguating number.
    ///
    /// For example, `amo` and `occido#2` are possible results.
    pub fn lemma(&self) -> &str {
        &self.lemma.lemma
    }

    /// Returns matches for this lemma.
    ///
    /// Currently, it only returns a sampling of the possible matches.
    /// However, in the future the exact results will be configurable.
    pub fn matches(&self) -> Vec<SingleResult> {
        self.sample_matches()
    }
}

pub type AutocompleteError = String;

pub struct DisplayOptions {
    /// Whether to show breves in the display. Macra are always shown.
    pub show_breves: bool,
}
