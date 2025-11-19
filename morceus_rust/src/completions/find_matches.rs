use std::collections::HashSet;

use crate::{
    ambiguous_uv_ij::alternates_with_i_or_u,
    completions::{
        AutocompleteError, AutocompleteResult, Autocompleter, AutompleterOptions, DisplayOptions,
        StemResult,
        stem_and_irreg_ranges::{PrefixRanges, compute_ranges_for, find_ranges_of_borrowed},
    },
    indices::{InflectionEnding, Lemma, Stem},
    stem_merging::merge_stem_and_ending,
};

type LemmaId = u16;

/// Creates an iterator that yields values from tables based on the given ranges.
/// Each tuple (start, end, table) yields table[start] through table[end-1].
fn range_pairs_to_iter(pairs: Vec<(usize, usize, &[LemmaId])>) -> impl Iterator<Item = &LemmaId> {
    pairs
        .into_iter()
        .flat_map(|(start, end, table)| table[start..end].iter())
}

/// An iterator over all of the lemmata that contain the stems and irregs that
/// could match a prefix (as specified by `ranges`).
fn lemma_ids_for_ranges<'a>(
    ranges: &PrefixRanges,
    completer: &'a Autocompleter,
) -> Result<impl Iterator<Item = &'a LemmaId>, AutocompleteError> {
    let mut range_pairs = vec![];

    if let Some((start, end)) = ranges.irregs_range {
        let range_pair = (start, end, completer.addenda.irreg_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }
    // Matches where the stem fully contains the prefix.
    if let Some((start, end)) = ranges.stem_range {
        let range_pair = (start, end, completer.addenda.stem_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }

    // Matches where the stem and the prefix both have a common root.
    // These could be matches if the ends of the stems complete the prefix.
    for range in &ranges.partial_stem_ranges {
        // We want the exact matches for the sub-prefix here; the remaining required
        // characters will be taken from the endings.
        let (start, end) = range.0;
        let range_pair = (start, end, completer.addenda.stem_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }

    Ok(range_pairs_to_iter(range_pairs))
}

/// Returns the IDs of irregular forms in the lemma that are in the given range.
fn filter_lemma_irregs(lemma: &Lemma, ranges: &PrefixRanges) -> Vec<usize> {
    let irregs = match &lemma.irregular_forms {
        Some(irregs) => irregs,
        // If there are no candidates, then there cannot be any matches.
        None => return vec![],
    };
    let (start, end) = match ranges.irregs_range {
        Some(r) => r,
        // If there's no range, then there cannot be any matches.
        None => return vec![],
    };

    irregs
        .iter()
        .map(|x| *x as usize)
        .filter(|x| start <= *x && *x < end)
        .collect()
}

/// Returns the IDs of stems in the lemma that are in the given ranges.
fn filter_lemma_stems<'a>(lemma: &Lemma, ranges: &'a PrefixRanges) -> Vec<(usize, &'a str)> {
    let mut matched_stems = vec![];
    let stems = match &lemma.stems {
        Some(stems) => stems,
        None => return matched_stems,
    };
    // We start with all stems unmatched, and then filter them down as we
    // check each range.
    let mut unmatched_stems = stems.iter().map(|x| *x as usize).collect::<HashSet<_>>();

    // For the last range (which is for the full prefix), we can accept anything
    // that is prefixed by that full prefix.
    if let Some((start, end)) = ranges.stem_range {
        let mut new_unmatched_stems = HashSet::new();
        for stem_id in unmatched_stems {
            if start <= stem_id && stem_id < end {
                // The entire prefix is matched by the stem, so there's nothing
                // left unmatched.
                matched_stems.push((stem_id, ""));
            } else {
                new_unmatched_stems.insert(stem_id);
            }
        }
        unmatched_stems = new_unmatched_stems;
    }

    // For all other ranges, we need exact matches (since we can potentially fill in the
    // remaining characters from the endings).
    for range in &ranges.partial_stem_ranges {
        let (start, end) = range.0;
        let mut new_unmatched_stems = HashSet::new();
        for stem_id in unmatched_stems {
            if start <= stem_id && stem_id < end {
                matched_stems.push((stem_id, &range.1));
            } else {
                new_unmatched_stems.insert(stem_id);
            }
        }
        unmatched_stems = new_unmatched_stems;
    }

    matched_stems
}

#[inline]
fn key_for_end_entry(entry: &(String, InflectionEnding)) -> &str {
    // TODO: It's unfortunate that we need to clone here, but the range finding
    // function requires owned strings. We can probably optimize this later.
    &entry.0
}

/// Finds the start and end indices of ends for the given stem that match with the given end prefix.
///
/// Arguments:
/// * `completer` - The autocompleter to use for lookups.
/// * `end_prefix` - The unmatched portion of the prefix that needs to be completed by endings.
/// * `stem` - The stem to find endings for.
/// * `exact_only` - Whether to only return exact matches (true) or also prefix matches (false).
///
/// Returns:
/// A vector of matching endings, if any were found.
fn find_ends_for<'a>(
    completer: &'a Autocompleter,
    end_prefix: &str,
    stem: &'a Stem,
    exact_only: bool,
) -> Result<Option<Vec<&'a InflectionEnding>>, AutocompleteError> {
    let ends = completer.ends_for(stem)?;
    if ends.is_empty() {
        return Ok(None);
    }
    if !exact_only && end_prefix.is_empty() {
        // If we are allowing prefix matches and the end prefix is empty, then
        // all endings are valid.
        return Ok(Some(ends.iter().map(|e| &e.1).collect()));
    }

    let end_target = if end_prefix.is_empty() {
        "*".to_string()
    } else {
        end_prefix.to_string()
    };

    let (start, end) =
        match find_ranges_of_borrowed(&end_target, exact_only, ends, key_for_end_entry) {
            None => return Ok(None),
            Some(r) => r,
        };

    Ok(Some(ends[start..end].iter().map(|e| &e.1).collect()))
}

/// Converts a candidate stem ID into a result, if it is valid.
///
/// # Arguments
/// * `stem_id` - The ID of the stem to convert.
/// * `unmatched` - The unmatched portion of the prefix that needs to be completed by endings.
/// * `completer` - The autocompleter to use for lookups.
/// * `exact_only` - Whether to only return exact matches (true) or also prefix matches (false).
fn stem_id_to_result<'a>(
    stem_id: usize,
    unmatched: &str,
    completer: &'a Autocompleter,
    exact_only: bool,
) -> Result<Option<StemResult<'a>>, AutocompleteError> {
    let stem = &completer.tables.all_stems[stem_id];
    let ends = match find_ends_for(completer, unmatched, stem, exact_only)? {
        // None just means there are no ends - it's not an error state.
        None => return Ok(None),
        Some(ends) if ends.is_empty() => return Ok(None),
        Some(ends) => ends,
    };
    let stem_result = StemResult { stem, ends };
    Ok(Some(stem_result))
}

/// Converts a candidate lemma ID into a candidate result. Note that
/// the lemma result may not have any valid completions at this stage.
fn lemma_id_to_result<'a, 'b>(
    lemma_id: LemmaId,
    ranges: &PrefixRanges,
    completer: &'a Autocompleter,
    display_options: &'b DisplayOptions,
    exact_only: bool,
) -> Result<AutocompleteResult<'a, 'b>, AutocompleteError> {
    let lemma = completer.lemma_from_id(lemma_id)?;

    let mut stems = vec![];
    for (stem_id, unmatched) in filter_lemma_stems(lemma, ranges) {
        match stem_id_to_result(stem_id, unmatched, completer, exact_only)? {
            None => continue,
            Some(result) => stems.push(result),
        }
    }

    let irregs = filter_lemma_irregs(lemma, ranges)
        .into_iter()
        .map(|i| &completer.tables.all_irregs[i])
        .collect::<Vec<_>>();

    let lemma_result = AutocompleteResult {
        lemma,
        stems,
        irregs,
        display_options,
    };

    Ok(lemma_result)
}

/// Validates the given lemma result, returning None if it has no valid completions.
fn validated_lemma_result<'a, 'b>(
    mut lemma_result: AutocompleteResult<'a, 'b>,
) -> Option<AutocompleteResult<'a, 'b>> {
    if !lemma_result.irregs.is_empty() {
        // Irregular forms don't need to be validated further, so we know
        // there's at least one valid completion.
        return Some(lemma_result);
    }
    let mut first_good_stem = None;
    'outer: for (i, stem) in lemma_result.stems.iter().enumerate() {
        for end in &stem.ends {
            if merge_stem_and_ending(stem.stem, end).is_some() {
                // Found at least one valid ending for this stem.
                first_good_stem = Some(i);
                break 'outer;
            }
        }
    }
    // Discard any stems that are known to have no valid endings,
    // but leave the rest for validation later to avoid doing
    // unneeded work, because the caller might not even look at the
    // endings for this lemma.
    let i = first_good_stem?;
    Some(AutocompleteResult {
        lemma: lemma_result.lemma,
        irregs: lemma_result.irregs,
        stems: lemma_result.stems.split_off(i),
        display_options: lemma_result.display_options,
    })
}

fn completions_for_prefix_base<'a, 'b>(
    prefix: &str,
    completer: &'a Autocompleter,
    limit: usize,
    options: &'b DisplayOptions,
    exact_only: bool,
) -> Result<Vec<AutocompleteResult<'a, 'b>>, AutocompleteError> {
    let ranges = compute_ranges_for(prefix, &completer.tables, exact_only)?;
    let mut seen_ids = HashSet::new();
    let mut results = Vec::new();

    let lemma_ids = lemma_ids_for_ranges(&ranges, completer)?;
    for lemma_id in lemma_ids {
        if results.len() >= limit {
            break;
        }
        if seen_ids.contains(lemma_id) {
            // Prevent duplicate matches.
            continue;
        }
        let lemma_result = lemma_id_to_result(*lemma_id, &ranges, completer, options, exact_only)?;
        let lemma_result = match validated_lemma_result(lemma_result) {
            None => continue,
            Some(r) => r,
        };
        seen_ids.insert(lemma_id);
        results.push(lemma_result);
    }
    Ok(results)
}

fn completions_or_matches_for<'a, 'b>(
    word_or_prefix: &str,
    completer: &'a Autocompleter,
    options: &'b AutompleterOptions,
    exact_only: bool,
) -> Result<Vec<AutocompleteResult<'a, 'b>>, AutocompleteError> {
    let mut variants = vec![word_or_prefix.to_string()];
    if options.relax_i_j || options.relax_u_v {
        variants.append(&mut alternates_with_i_or_u(
            word_or_prefix,
            options.relax_i_j,
            options.relax_u_v,
        ));
    }

    let mut all_results = Vec::new();
    let mut results_so_far = 0;
    for variant in variants {
        let limit = options.result_limit.saturating_sub(results_so_far);
        if limit == 0 {
            break;
        }
        let results = completions_for_prefix_base(
            &variant,
            completer,
            limit,
            &options.display_options,
            exact_only,
        )?;
        results_so_far += results.len();
        all_results.push(results);
    }
    Ok(all_results.into_iter().flatten().collect())
}

pub(super) fn completions_for_prefix<'a, 'b>(
    prefix: &str,
    completer: &'a Autocompleter,
    options: &'b AutompleterOptions,
) -> Result<Vec<AutocompleteResult<'a, 'b>>, AutocompleteError> {
    completions_or_matches_for(prefix, completer, options, false)
}

pub(super) fn matches_for_word<'a, 'b>(
    word: &str,
    completer: &'a Autocompleter,
    options: &'b AutompleterOptions,
) -> Result<Vec<AutocompleteResult<'a, 'b>>, AutocompleteError> {
    completions_or_matches_for(word, completer, options, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_pairs_to_iter() {
        let table1 = vec![10, 20, 30, 40];
        let table2 = vec![70, 80, 90];
        let table3 = vec![100, 200, 300];

        let pairs: Vec<(usize, usize, &[u16])> =
            vec![(1, 4, &table1), (0, 2, &table2), (2, 3, &table3)];
        let result = range_pairs_to_iter(pairs).copied().collect::<Vec<_>>();
        assert_eq!(result, vec![20, 30, 40, 70, 80, 300]);
    }

    #[test]
    fn test_empty_ranges() {
        let pairs: Vec<(usize, usize, &[u16])> = vec![];
        let result = range_pairs_to_iter(pairs).copied().collect::<Vec<_>>();
        assert_eq!(result, vec![]);
    }

    #[test]
    fn test_single_element_ranges() {
        let table1 = vec![5, 6, 7];
        let table2 = vec![10, 11, 12];
        let pairs: Vec<(usize, usize, &[u16])> = vec![(1, 2, &table1), (0, 1, &table2)];
        let result = range_pairs_to_iter(pairs).copied().collect::<Vec<_>>();
        assert_eq!(result, vec![6, 10]);
    }

    #[test]
    fn test_zero_size_ranges() {
        let table1 = vec![5, 6, 7];
        let table2 = vec![10, 11, 12];
        let pairs: Vec<(usize, usize, &[u16])> = vec![(1, 1, &table1), (0, 1, &table2)];
        let result = range_pairs_to_iter(pairs).copied().collect::<Vec<_>>();
        assert_eq!(result, vec![10]);
    }
}
