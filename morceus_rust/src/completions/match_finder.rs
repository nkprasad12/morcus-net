use crate::{
    completions::{
        AutocompleteError, AutocompleteResult, Autocompleter, IrregResult, PrefixRanges,
        StemResult, compute_ranges, normalize_key,
    },
    indices::{InflectionEnding, Stem},
};

pub(super) struct MatchFinder<'a> {
    ranges: Vec<PrefixRanges>,
    completer: &'a Autocompleter<'a>,
}

impl<'t> MatchFinder<'t> {
    /// Creates a MatchFinder for the given prefix and tables.
    ///
    /// # Arguments
    /// * `prefix` - The normalized prefix to match. Must not be empty and must be
    ///   only ASCII characters.
    /// * `tables` - The CruncherTables to use for completions.
    pub(super) fn for_prefix<'a>(
        prefix: &str,
        completer: &'a Autocompleter<'a>,
    ) -> Result<MatchFinder<'a>, AutocompleteError> {
        let prefix = normalize_key(prefix);
        if !prefix.is_ascii() {
            return Err("Only ASCII prefixes are supported.".to_string());
        }
        if prefix.is_empty() {
            return Err("Empty prefixes are not allowed.".to_string());
        }
        let ranges = compute_ranges(&prefix, completer.tables);
        Ok(MatchFinder { ranges, completer })
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

        let mut results = vec![];
        let end = std::cmp::min(end, start + limit);
        for i in start..end {
            let irreg = &self.completer.tables.all_irregs[i];
            let lemma = self.completer.lemma_for_irreg(i)?;
            results.push(AutocompleteResult::Irreg(IrregResult { irreg, lemma }));
        }

        Ok(results)
    }

    /// Finds the start and end indices of ends for the given stem that start with the given end prefix.
    fn find_ends_for(
        &self,
        end_prefix: String,
        stem: &Stem,
    ) -> Result<Option<Vec<&'t InflectionEnding>>, AutocompleteError> {
        let ends = self.completer.ends_for(stem)?;
        if ends.is_empty() {
            return Ok(None);
        }
        if end_prefix.is_empty() {
            return Ok(Some(ends.iter().map(|e| e.1).collect()));
        }

        // Binary search for the first irregular form that starts with or comes after the prefix
        let start = ends.partition_point(|end| end.0 < end_prefix);
        if start >= ends.len() {
            return Ok(None);
        }

        let first_ending = &ends[start].0;
        if !first_ending.starts_with(&end_prefix) {
            // The partition point will tell us either where the prefix actually starts,
            // or where it would be inserted. In this case, the prefix would be inserted here,
            // so there are no matching irregular forms.
            return Ok(None);
        }

        let prefix_end = ends[start..].partition_point(|end| end.0.starts_with(&end_prefix));
        Ok(Some(
            ends[start..start + prefix_end]
                .iter()
                .map(|e| e.1)
                .collect(),
        ))
    }

    fn resolve_stem_ranges(
        &self,
        range: &Option<(usize, usize)>,
        sub_prefix_len: Option<usize>,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let (start, end) = match range {
            Some(r) => r,
            None => return Ok(vec![]),
        };

        // If the stem is only a partial match for the prefix, we need to
        // find the required characters that are needed on the endings to
        // complete the prefix.
        let required_chars = match sub_prefix_len {
            // Note: we use a byte slice here because we verify in the constructor that the prefix is
            // ASCII only (so 1 byte per character).
            Some(len) => Some(&self.last_ranges()?.prefix[len..]),
            None => None,
        };

        let mut results = Vec::new();
        for i in *start..*end {
            let stem = &self.completer.tables.all_stems[i];
            let ends = match required_chars {
                Some(chars) => match self.find_ends_for(chars.to_string(), stem)? {
                    Some(e) => e,
                    None => continue,
                },
                // If there are no required chars, return all endings for the stem.
                None => self.completer.ends_for(stem)?.iter().map(|e| e.1).collect(),
            };
            if ends.is_empty() {
                continue;
            }
            let lemma = self.completer.lemma_for_stem(i)?;
            let stem_result = StemResult { stem, ends, lemma };
            results.push(AutocompleteResult::Stem(stem_result));
            if results.len() >= limit {
                break;
            }
        }
        Ok(results)
    }

    /// Returns matches where the stem fully contains the prefix.
    fn full_stem_matches(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let range = &self.last_ranges()?.prefix_stem_range;
        self.resolve_stem_ranges(range, None, limit)
    }

    /// Returns matches where the stem partially contains the prefix.
    fn partial_stem_matches(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let mut results = Vec::new();
        for ranges in self.ranges.iter().take(self.ranges.len() - 1) {
            let sub_prefix_len = Some(ranges.prefix.len());
            let remaining_limit = limit - results.len();
            // We want the exact matches for the sub-prefix here; the remaining required
            // characters will be taken from the endings.
            let range = &ranges.exact_stem_range;
            let mut matches = self.resolve_stem_ranges(range, sub_prefix_len, remaining_limit)?;
            results.append(&mut matches);
            if results.len() >= limit {
                break;
            }
        }
        Ok(results)
    }

    pub(super) fn completions(
        &self,
        limit: usize,
    ) -> Result<Vec<AutocompleteResult<'t>>, AutocompleteError> {
        let mut results = Vec::new();
        results.append(&mut self.full_stem_matches(limit)?);
        results.append(&mut self.partial_stem_matches(limit - results.len())?);
        results.append(&mut self.irreg_matches(limit - results.len())?);
        Ok(results)
    }
}
