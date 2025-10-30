use crate::indices::{
    CruncherTables, InflectionEnding, InflectionLookupEntry, IrregularForm, Stem,
};

// ----------------
// Public API below
// ----------------

pub enum AutocompleteResult<'a> {
    Stem(StemResult<'a>),
    Irreg(&'a IrregularForm),
}

// We can use a more sophisticated error type later if needed.
pub type AutocompleteError = String;

pub fn completions_for<'a>(
    prefix: &str,
    tables: &'a CruncherTables,
    limit: usize,
) -> Result<Vec<AutocompleteResult<'a>>, AutocompleteError> {
    Autocompleter::for_prefix(prefix, tables)?.completions(limit)
}

pub struct StemResult<'a> {
    stem: &'a Stem,
    tables: &'a CruncherTables,
    required_chars: Option<String>,
}

pub struct SingleStemResult<'a> {
    pub stem: &'a Stem,
    pub ending: &'a InflectionEnding,
}

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

// ----------------
// Public API above
// ----------------

const REMOVE_CHARS: [char; 4] = ['^', '-', '_', '+'];

fn normalize_key(s: &str) -> String {
    s.to_lowercase().replace(REMOVE_CHARS, "")
}

struct PrefixRanges {
    /// The prefix associated with these ranges.
    prefix: String,
    /// The range of prefixed stems in the list.
    ///
    /// The start is inclusive, the end is exclusive.
    ///
    /// For example, if we have stems \["apple", "application", "apps"\],
    /// and the prefix is `"appl"`, then the range would be (0, 2).
    prefix_stem_range: Option<(usize, usize)>,
    /// The range of exact matches for stems in the list.
    ///
    /// The start is inclusive, the end is exclusive.
    ///
    /// For example, if we have stems \["apple", "application", "apps"\],
    /// and the prefix is `"apple"`, then the range would be (0, 1).
    exact_stem_range: Option<(usize, usize)>,
    /// The range of prefixed irregular forms in the list.
    ///
    /// The start is inclusive, the end is exclusive.
    /// For example, if we have irregular forms \["est", "esse", "estimo"\],
    /// and the prefix is `"es"`, then the range would be (0, 3).
    prefix_irregs_range: Option<(usize, usize)>,
}

impl PrefixRanges {
    fn make_empty(prefix: String) -> Self {
        PrefixRanges {
            prefix,
            prefix_stem_range: None,
            exact_stem_range: None,
            prefix_irregs_range: None,
        }
    }

    fn all_empty(&self) -> bool {
        self.prefix_stem_range.is_none()
            && self.exact_stem_range.is_none()
            && self.prefix_irregs_range.is_none()
    }
}

#[derive(Default)]
struct StemRanges {
    /// The ranges `[start, end)` that are prefixes.
    prefix_range: Option<(usize, usize)>,
    /// The ranges `[start, end)` that are exact matches.
    exact_range: Option<(usize, usize)>,
}

/// Finds the start and end indices of stems starting with the given prefix.
///
/// # Arguments
/// * `prefix` - The normalized prefix to match. Must not be empty.
/// * `stems` - The list of stems to search. The stems should be in sorted order,
///   with the stems normalized by `normalize_key`.
///
/// # Returns
/// Ranges of matches for the prefix.
fn find_stem_ranges(prefix: &str, stems: &[Stem]) -> StemRanges {
    if stems.is_empty() || prefix.is_empty() {
        return StemRanges::default();
    }

    // Binary search for the first stem that starts with or comes after the prefix
    let start = stems.partition_point(|stem| {
        let normalized = normalize_key(&stem.stem);
        normalized.as_str() < prefix
    });

    if start >= stems.len() {
        return StemRanges::default();
    }

    let normalized_start = normalize_key(&stems[start].stem);
    if !normalized_start.starts_with(prefix) {
        // The partition point will tell us either where the prefix actually starts,
        // or where it would be inserted. In this case, the prefix would be inserted here,
        // so there are no matching stems.
        return StemRanges::default();
    }

    let prefix_end = stems[start..].partition_point(|stem| {
        let normalized = normalize_key(&stem.stem);
        normalized.starts_with(prefix)
    });

    let prefix_range = Some((start, start + prefix_end));
    let exact_range = if normalized_start == prefix {
        let exact_end = stems[start..].partition_point(|stem| normalize_key(&stem.stem) == prefix);
        Some((start, start + exact_end))
    } else {
        None
    };

    StemRanges {
        prefix_range,
        exact_range,
    }
}

/// Finds the start and end indices of irregs starting with the given prefix.
///
/// TODO: This may be consolidated with `find_stem_ranges`.
fn find_irreg_ranges(prefix: &str, irregs: &[IrregularForm]) -> Option<(usize, usize)> {
    if irregs.is_empty() || prefix.is_empty() {
        return None;
    }

    // Binary search for the first irregular form that starts with or comes after the prefix
    let start = irregs.partition_point(|irreg| {
        let normalized = normalize_key(&irreg.form);
        normalized.as_str() < prefix
    });

    if start >= irregs.len() {
        return None;
    }

    let normalized_start = normalize_key(&irregs[start].form);
    if !normalized_start.starts_with(prefix) {
        // The partition point will tell us either where the prefix actually starts,
        // or where it would be inserted. In this case, the prefix would be inserted here,
        // so there are no matching irregular forms.
        return None;
    }

    let prefix_end = irregs[start..].partition_point(|irreg| {
        let normalized = normalize_key(&irreg.form);
        normalized.starts_with(prefix)
    });

    Some((start, start + prefix_end))
}

fn compute_ranges(prefix: &str, tables: &CruncherTables) -> Vec<PrefixRanges> {
    let mut ranges = Vec::new();
    let mut prefix_so_far: String = String::new();
    for c in prefix.chars() {
        prefix_so_far.push(c);
        if ranges.last().is_some_and(|p: &PrefixRanges| p.all_empty()) {
            // If the last prefix had no matches, all longer prefixes will also have no matches.
            ranges.push(PrefixRanges::make_empty(prefix_so_far.clone()));
            continue;
        }

        let stem_ranges = find_stem_ranges(&prefix_so_far, &tables.all_stems);
        let irreg_ranges = find_irreg_ranges(&prefix_so_far, &tables.all_irregs);
        ranges.push(PrefixRanges {
            prefix: prefix_so_far.clone(),
            prefix_stem_range: stem_ranges.prefix_range,
            exact_stem_range: stem_ranges.exact_range,
            prefix_irregs_range: irreg_ranges,
        });
    }
    ranges
}

fn display_form(input: &str, options: &DisplayOptions) -> String {
    let breve_mark = if options.show_breves { "\u{0306}" } else { "" };
    input
        .replace(['-', '+'], "")
        .replace('^', breve_mark)
        .replace('_', "\u{0304}")
}

struct Autocompleter<'a> {
    ranges: Vec<PrefixRanges>,
    tables: &'a CruncherTables,
}

impl<'t> Autocompleter<'t> {
    /// Creates an Autocompleter for the given prefix and tables.
    ///
    /// # Arguments
    /// * `prefix` - The normalized prefix to match. Must not be empty and must be
    ///   only ASCII characters.
    /// * `tables` - The CruncherTables to use for completions.
    fn for_prefix<'a>(
        prefix: &str,
        tables: &'a CruncherTables,
    ) -> Result<Autocompleter<'a>, AutocompleteError> {
        let prefix = normalize_key(prefix);
        if !prefix.is_ascii() {
            return Err("Only ASCII prefixes are supported.".to_string());
        }
        if prefix.is_empty() {
            return Err("Empty prefixes are not allowed.".to_string());
        }
        let ranges = compute_ranges(&prefix, tables);
        Ok(Autocompleter { ranges, tables })
    }

    /// Returns ranges for the last range set (i.e. for the full prefix).
    fn last_ranges(&self) -> Result<&PrefixRanges, AutocompleteError> {
        self.ranges
            .last()
            .ok_or("Unexpected empty prefix!".to_string())
    }

    /// Returns matches for irregular forms.
    fn irreg_matches(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let (start, end) = match self.last_ranges()?.prefix_irregs_range {
            Some(r) => r,
            None => return Ok(vec![]),
        };

        Ok(self.tables.all_irregs[start..end]
            .iter()
            .take(limit)
            .map(AutocompleteResult::Irreg)
            .collect())
    }

    /// Returns matches where the stem fully contains the prefix.
    fn full_stem_matches(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let (start, end) = match self.last_ranges()?.prefix_stem_range {
            Some(r) => r,
            None => return Ok(vec![]),
        };

        Ok(self.tables.all_stems[start..end]
            .iter()
            .map(|stem| StemResult {
                stem,
                tables: self.tables,
                // For full matches, we don't have any required chars.
                required_chars: None,
            })
            .filter(|r| r.has_first_match())
            .take(limit)
            .map(AutocompleteResult::Stem)
            .collect())
    }

    /// Returns matches where the stem exactly matches the prefix for the particular sub-prefix.
    fn partial_stem_matches_for(
        &self,
        ranges: &PrefixRanges,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let (start, end) = match ranges.exact_stem_range {
            Some(r) => r,
            None => return Ok(vec![]),
        };
        // Note: we use a byte slice here because we verify in the constructor that the prefix is
        // ASCII only (so 1 byte per character).
        let required_chars = &self.last_ranges()?.prefix[ranges.prefix.len()..];
        Ok(self.tables.all_stems[start..end]
            .iter()
            .map(|stem| StemResult {
                stem,
                tables: self.tables,
                required_chars: Some(required_chars.to_string()),
            })
            .filter(|r| r.has_first_match())
            .take(limit)
            .map(AutocompleteResult::Stem)
            .collect())
    }

    /// Returns matches where the stem partially contains the prefix.
    fn partial_stem_matches(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let mut results = Vec::new();
        for ranges in self.ranges.iter().take(self.ranges.len() - 1) {
            let mut matches = self.partial_stem_matches_for(ranges, limit - results.len())?;
            results.append(&mut matches);
            if results.len() >= limit {
                break;
            }
        }
        Ok(results)
    }

    fn completions(&self, limit: usize) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let mut results = Vec::new();
        results.append(&mut self.full_stem_matches(limit)?);
        results.append(&mut self.partial_stem_matches(limit - results.len())?);
        results.append(&mut self.irreg_matches(limit - results.len())?);
        Ok(results)
    }
}

impl<'t> StemResult<'t> {
    /// Returns the end table for a particular stem.
    fn end_table_for(
        &self,
        stem: &'t Stem,
    ) -> Result<&'t InflectionLookupEntry, AutocompleteError> {
        self.tables
            .inflection_lookup
            .get(stem.inflection as usize)
            .ok_or("Invalid inflection index".to_string())
    }

    fn single_stem_result(&self, ending: &'t InflectionEnding) -> Option<SingleStemResult<'t>> {
        Some(SingleStemResult {
            stem: self.stem,
            ending,
        })
    }

    fn has_first_match(&self) -> bool {
        matches!(self.first_match(), Ok(Some(_)))
    }

    pub fn first_match(&self) -> Result<Option<SingleStemResult<'t>>, AutocompleteError> {
        let end_table = self.end_table_for(self.stem)?;
        let required_chars = match &self.required_chars {
            Some(rc) => rc,
            None => {
                // Because the whole prefix is contained in the stem, any inflection ending
                // will also be a prefix. For now, we are just taking one ending to show a sample,
                // but in the future we will find a reasonable API to provide the rest.
                let ending = &end_table
                    .values()
                    .next()
                    .ok_or("Inflection table has no endings")?[0];
                return Ok(self.single_stem_result(ending));
            }
        };
        for (end, matches) in end_table.iter() {
            let clean_end = normalize_key(end);
            if clean_end.len() < required_chars.len() {
                continue;
            }
            // Note: we use a byte slice here because we verify in the constructor that the prefix is
            // ASCII only (so 1 byte per character).
            if clean_end[..required_chars.len()] == *required_chars {
                return Ok(self.single_stem_result(&matches[0]));
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use crate::indices::{InflectionContext, StemCode};

    use super::*;

    fn create_stem(s: &str) -> Stem {
        Stem {
            stem: s.to_string(),
            code: StemCode::None,
            inflection: 0,
            context: InflectionContext {
                grammatical_data: 0,
                tags: None,
                internal_tags: None,
            },
        }
    }

    fn create_irreg(form: &str) -> IrregularForm {
        IrregularForm {
            form: form.to_string(),
            code: StemCode::None,
            context: InflectionContext {
                grammatical_data: 0,
                tags: None,
                internal_tags: None,
            },
        }
    }

    #[test]
    fn test_find_stem_ranges_empty_stems() {
        let stems: Vec<Stem> = vec![];
        let result = find_stem_ranges("test", &stems);

        assert_eq!(result.prefix_range, None);
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_empty_prefix() {
        let stems = vec![create_stem("test")];
        let result = find_stem_ranges("", &stems);

        assert_eq!(result.prefix_range, None);
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_single_match() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banana"),
            create_stem("cherry"),
        ];
        let result = find_stem_ranges("banana", &stems);

        assert_eq!(result.prefix_range, Some((1, 2)));
        assert_eq!(result.exact_range, Some((1, 2)));
    }

    #[test]
    fn test_find_stem_ranges_multiple_matches() {
        let stems = vec![
            create_stem("ac"),
            create_stem("apple"),
            create_stem("application"),
            create_stem("apply"),
            create_stem("banana"),
            create_stem("candy"),
            create_stem("donkey"),
            create_stem("elephant"),
        ];
        let result = find_stem_ranges("app", &stems);

        assert_eq!(result.prefix_range, Some((1, 4)));
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_prefix_before_all() {
        let stems = vec![
            create_stem("banana"),
            create_stem("cherry"),
            create_stem("date"),
        ];
        let result = find_stem_ranges("apple", &stems);

        assert_eq!(result.prefix_range, None);
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_prefix_after_all() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banana"),
            create_stem("cherry"),
        ];
        let result = find_stem_ranges("zebra", &stems);

        assert_eq!(result.prefix_range, None);
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_case_insensitive() {
        let stems = vec![
            create_stem("Apple"),
            create_stem("BANANA"),
            create_stem("Cherry"),
        ];
        let result = find_stem_ranges("app", &stems);

        assert_eq!(result.prefix_range, Some((0, 1)));
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_with_special_chars() {
        let stems = vec![
            create_stem("a^pple"),
            create_stem("app-le"),
            create_stem("app_lication"),
            create_stem("banana"),
        ];
        let result = find_stem_ranges("appl", &stems);

        assert_eq!(result.prefix_range, Some((0, 3)));
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_with_multiple_exact_matches() {
        let stems = vec![
            create_stem("a^pple"),
            create_stem("app-le"),
            create_stem("app_lication"),
            create_stem("banana"),
        ];
        let result = find_stem_ranges("apple", &stems);

        assert_eq!(result.prefix_range, Some((0, 2)));
        assert_eq!(result.exact_range, Some((0, 2)));
    }

    #[test]
    fn test_find_stem_ranges_partial_match_at_end() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banan"),
            create_stem("candy"),
        ];
        let result = find_stem_ranges("cand", &stems);

        assert_eq!(result.prefix_range, Some((2, 3)));
        assert_eq!(result.exact_range, None);
    }

    #[test]
    fn test_find_stem_ranges_exact_match() {
        let stems = vec![
            create_stem("test"),
            create_stem("tester"),
            create_stem("testing"),
        ];
        let result = find_stem_ranges("test", &stems);

        assert_eq!(result.prefix_range, Some((0, 3)));
        assert_eq!(result.exact_range, Some((0, 1)));
    }

    #[test]
    fn test_find_irreg_ranges_empty_irregs() {
        let irregs: Vec<IrregularForm> = vec![];
        let result = find_irreg_ranges("test", &irregs);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_empty_prefix() {
        let irregs = vec![create_irreg("test")];
        let result = find_irreg_ranges("", &irregs);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_single_match() {
        let irregs = vec![
            create_irreg("est"),
            create_irreg("sum"),
            create_irreg("sunt"),
        ];
        let result = find_irreg_ranges("sum", &irregs);

        assert_eq!(result, Some((1, 2)));
    }

    #[test]
    fn test_find_irreg_ranges_multiple_matches() {
        let irregs = vec![
            create_irreg("es"),
            create_irreg("esse"),
            create_irreg("est"),
            create_irreg("esto"),
            create_irreg("sum"),
        ];
        let result = find_irreg_ranges("est", &irregs);

        assert_eq!(result, Some((2, 4)));
    }

    #[test]
    fn test_find_irreg_ranges_prefix_before_all() {
        let irregs = vec![
            create_irreg("est"),
            create_irreg("sum"),
            create_irreg("sunt"),
        ];
        let result = find_irreg_ranges("abc", &irregs);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_prefix_after_all() {
        let irregs = vec![create_irreg("es"), create_irreg("est"), create_irreg("sum")];
        let result = find_irreg_ranges("xyz", &irregs);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_case_insensitive() {
        let irregs = vec![
            create_irreg("Est"),
            create_irreg("SUM"),
            create_irreg("Sunt"),
        ];
        let result = find_irreg_ranges("es", &irregs);

        assert_eq!(result, Some((0, 1)));
    }

    #[test]
    fn test_find_irreg_ranges_with_special_chars() {
        let irregs = vec![
            create_irreg("e^st"),
            create_irreg("es-se"),
            create_irreg("est_o"),
            create_irreg("sum"),
        ];
        let result = find_irreg_ranges("es", &irregs);

        assert_eq!(result, Some((0, 3)));
    }

    #[test]
    fn test_find_irreg_ranges_partial_match_at_end() {
        let irregs = vec![create_irreg("es"), create_irreg("est"), create_irreg("sun")];
        let result = find_irreg_ranges("su", &irregs);

        assert_eq!(result, Some((2, 3)));
    }

    #[test]
    fn test_find_irreg_ranges_no_match_in_middle() {
        let irregs = vec![
            create_irreg("abc"),
            create_irreg("def"),
            create_irreg("xyz"),
        ];
        let result = find_irreg_ranges("ghi", &irregs);

        assert_eq!(result, None);
    }
}
