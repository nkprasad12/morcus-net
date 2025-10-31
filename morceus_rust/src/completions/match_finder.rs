use std::collections::HashMap;

use crate::{
    completions::{
        AutocompleteError, AutocompleteResult, Autocompleter, IrregResult, LemmaResult,
        PrefixRanges, StemResult, compute_ranges,
    },
    indices::{InflectionEnding, Stem},
};

pub(super) struct MatchFinder<'a> {
    ranges: Vec<PrefixRanges>,
    completer: &'a Autocompleter<'a>,
}

type StemIterator<'t, 'a> =
    Box<dyn Iterator<Item = Result<AutocompleteResult<'t>, AutocompleteError>> + 'a>;
type IrregIterator<'t> = Box<dyn Iterator<Item = AutocompleteResult<'t>> + 't>;

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
        let ranges = compute_ranges(prefix, completer.tables)?;
        Ok(MatchFinder { ranges, completer })
    }

    /// Returns ranges for the last range set (i.e. for the full prefix).
    fn last_ranges(&self) -> Result<&PrefixRanges, AutocompleteError> {
        self.ranges
            .last()
            .ok_or("Unexpected empty prefix!".to_string())
    }

    /// Returns matches for irregular forms.
    fn irreg_matches(&self) -> Result<IrregIterator<'t>, AutocompleteError> {
        let (start, end) = match self.last_ranges()?.prefix_irregs_range {
            Some(r) => r,
            None => return Ok(Box::new(std::iter::empty())),
        };
        Ok(Box::new((start..end).map(|i| {
            let irreg = &self.completer.tables.all_irregs[i];
            AutocompleteResult::Irreg(IrregResult { irreg, irreg_id: i })
        })))
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

    fn resolve_stem_ranges<'a>(
        &'a self,
        range: &Option<(usize, usize)>,
        sub_prefix_len: Option<usize>,
    ) -> Result<StemIterator<'t, 'a>, AutocompleteError> {
        let (start, end) = match range {
            Some(r) => r,
            None => return Ok(Box::new(std::iter::empty())),
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

        Ok(Box::new((*start..*end).filter_map(move |i| {
            let stem = &self.completer.tables.all_stems[i];
            let ends = match &required_chars {
                Some(chars) => match self.find_ends_for(chars.to_string(), stem).ok()? {
                    Some(e) => e,
                    None => return None,
                },
                // If there are no required chars, return all endings for the stem.
                None => self
                    .completer
                    .ends_for(stem)
                    .ok()?
                    .iter()
                    .map(|e| e.1)
                    .collect(),
            };
            if ends.is_empty() {
                return None;
            }
            let stem_result = StemResult {
                stem,
                ends,
                stem_id: i,
            };
            Some(Ok(AutocompleteResult::Stem(stem_result)))
        })))
    }

    /// Returns matches where the stem fully contains the prefix.
    fn full_stem_matches<'a>(&'a self) -> Result<StemIterator<'t, 'a>, AutocompleteError> {
        let range = &self.last_ranges()?.prefix_stem_range;
        self.resolve_stem_ranges(range, None)
    }

    /// Returns matches where the stem partially contains the prefix.
    fn partial_stem_matches<'a>(&'a self) -> Result<StemIterator<'t, 'a>, AutocompleteError> {
        Ok(Box::new(
            self.ranges[..self.ranges.len().saturating_sub(1)]
                .iter()
                .flat_map(|ranges| {
                    let sub_prefix_len = Some(ranges.prefix.len());
                    // We want the exact matches for the sub-prefix here; the remaining required
                    // characters will be taken from the endings.
                    let range = &ranges.exact_stem_range;
                    self.resolve_stem_ranges(range, sub_prefix_len)
                        .into_iter()
                        .flatten()
                }),
        ))
    }

    pub(super) fn completions(
        &self,
        limit: usize,
    ) -> Result<Vec<LemmaResult<'t>>, AutocompleteError> {
        let mut lemma_to_results = HashMap::new();

        let full_stems = self.full_stem_matches()?;
        let partial_stems = self.partial_stem_matches()?;
        let irregs = self.irreg_matches()?;

        for stem in full_stems {
            let stem = stem?;
            let stem_id = match &stem {
                AutocompleteResult::Stem(stem_result) => stem_result.stem_id,
                _ => continue,
            };
            let lemma_id = self.completer.lemma_id_for_stem(stem_id)?;
            lemma_to_results
                .entry(lemma_id)
                .or_insert_with(Vec::new)
                .push(stem);
            if lemma_to_results.len() >= limit {
                break;
            }
        }

        for stem in partial_stems {
            let stem = stem?;
            let stem_id = match &stem {
                AutocompleteResult::Stem(stem_result) => stem_result.stem_id,
                _ => continue,
            };
            let lemma_id = self.completer.lemma_id_for_stem(stem_id)?;
            lemma_to_results
                .entry(lemma_id)
                .or_insert_with(Vec::new)
                .push(stem);
        }

        for irreg in irregs {
            let irreg_id = match &irreg {
                AutocompleteResult::Irreg(irreg_result) => irreg_result.irreg_id,
                _ => continue,
            };
            let lemma_id = self.completer.lemma_id_for_irreg(irreg_id)?;
            lemma_to_results
                .entry(lemma_id)
                .or_insert_with(Vec::new)
                .push(irreg);
            if lemma_to_results.len() >= limit {
                break;
            }
        }

        let mut lemma_results = vec![];
        for (lemma_id, results) in lemma_to_results {
            let lemma = self.completer.lemma_from_id(lemma_id)?;
            let mut stems = Vec::new();
            let mut irregs = Vec::new();
            for result in results {
                match result {
                    AutocompleteResult::Stem(stem_result) => stems.push(stem_result),
                    AutocompleteResult::Irreg(irreg_result) => irregs.push(irreg_result),
                }
            }
            lemma_results.push(LemmaResult {
                lemma,
                stems,
                irregs,
            });
        }
        Ok(lemma_results)
    }
}
