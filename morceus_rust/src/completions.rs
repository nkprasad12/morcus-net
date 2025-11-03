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

/// The main entry point for completions.
pub struct Autocompleter<'a, 'b> {
    tables: &'a CruncherTables,
    addenda: Addenda<'a>,
    options: &'b AutompleterOptions,
}

impl<'t, 'o> Autocompleter<'t, 'o> {
    /// Creates an autocompleter with the given options.
    ///
    /// # Arguments
    /// * `tables` - The underlying tables used for completions. Currently these aren't generated in Rust code.
    ///   Instead, they are generated in the Javascript code using Node.js (or Bun).
    ///   To create tables, from the `morcus-net` repo root, run:
    ///   `./morcus.sh build --morceus_tables`
    /// * `options` - Options for the autocompleter.
    pub fn new(
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

    /// Returns a sampling of matches for this lemma. There are no guarantees
    /// on exactly what will be returned except that at least one match will be produced.
    pub fn sample_matches(&self) -> impl Iterator<Item = SingleResult> + '_ {
        self.iterate_matches(Some(1))
    }

    /// Returns an iterator over all possible matching forms for this lemma.
    pub fn all_matches(&self) -> impl Iterator<Item = SingleResult> + '_ {
        self.iterate_matches(None)
    }
}

pub type AutocompleteError = String;

#[derive(Clone)]
pub struct AutompleterOptions {
    /// The maximum number of lemmata to return for a completion request.
    pub result_limit: usize,
    /// Display options for formatting the output forms.
    pub display_options: DisplayOptions,
    /// In an input where `i` is universally used, attempts to find matches where
    /// where some of the `i`s are consonantal (and thus `j` by the Morceus convention).
    pub relax_i_j: bool,
    /// In an input where `u` is universally used, attempts to find matches where
    /// where some of the `u`s are consonantal (and thus `v` by the Morceus convention).
    pub relax_u_v: bool,
}

static DEFAULT_OPTIONS: AutompleterOptions = AutompleterOptions {
    // All but ~15 3 letter prefixes have less than 250 completions.
    // If we hit the limit of 250, the result is still fast (< 100 us)
    // and only takes a few dozen kB of memory, so this is a reasonable
    // place to put the default.
    result_limit: 250,
    display_options: DisplayOptions { show_breves: false },
    relax_i_j: true,
    relax_u_v: false,
};

impl AutompleterOptions {
    /// Creates a new builder for `AutompleterOptions`.
    pub fn builder() -> AutompleterOptionsBuilder {
        AutompleterOptionsBuilder::from_default()
    }
}

impl Default for AutompleterOptions {
    fn default() -> Self {
        DEFAULT_OPTIONS.clone()
    }
}

/// Builder for `AutompleterOptions`.
pub struct AutompleterOptionsBuilder {
    internal: AutompleterOptions,
}

impl AutompleterOptionsBuilder {
    fn from_default() -> Self {
        AutompleterOptionsBuilder {
            internal: DEFAULT_OPTIONS.clone(),
        }
    }

    /// Sets the maximum number of lemmata to return.
    pub fn result_limit(mut self, limit: usize) -> Self {
        self.internal.result_limit = limit;
        self
    }

    /// Sets the display options for formatting output forms.
    pub fn display_options(mut self, options: DisplayOptions) -> Self {
        self.internal.display_options = options;
        self
    }

    /// Sets whether to relax i/j matching.
    pub fn relax_i_j(mut self, relax: bool) -> Self {
        self.internal.relax_i_j = relax;
        self
    }

    /// Sets whether to relax u/v matching.
    pub fn relax_u_v(mut self, relax: bool) -> Self {
        self.internal.relax_u_v = relax;
        self
    }

    /// Builds the `AutompleterOptions` with the configured values.
    /// Unset values will use defaults from `DEFAULT_OPTIONS`.
    pub fn build(self) -> AutompleterOptions {
        self.internal.clone()
    }
}

#[derive(Clone)]
pub struct DisplayOptions {
    /// Whether to show breves in the display. Macra are always shown.
    pub show_breves: bool,
}
