use std::collections::{HashMap, HashSet};

use crate::{
    completions::{
        AutocompleteError, Autocompleter, IrregResult, LemmaResult, PrefixRanges, StemResult,
        compute_ranges,
    },
    indices::{InflectionEnding, Lemma, Stem},
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
    last_range: &PrefixRanges,
    prior_ranges: &[PrefixRanges],
    completer: &'a Autocompleter,
) -> Result<impl Iterator<Item = &'a LemmaId>, AutocompleteError> {
    let mut range_pairs = vec![];

    // Matches where the stem fully contains the prefix.
    if let Some((start, end)) = last_range.prefix_irregs_range {
        let range_pair = (start, end, completer.addenda.irreg_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }
    if let Some((start, end)) = last_range.prefix_stem_range {
        let range_pair = (start, end, completer.addenda.stem_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }

    // Matches where the stem and the prefix both have a common root.
    // These could be matches if the ends of the stems complete the prefix.
    for ranges in prior_ranges {
        // We want the exact matches for the sub-prefix here; the remaining required
        // characters will be taken from the endings.
        let (start, end) = match ranges.exact_stem_range {
            Some(r) => r,
            None => continue,
        };
        let range_pair = (start, end, completer.addenda.stem_to_lemma.as_slice());
        range_pairs.push(range_pair);
    }

    Ok(range_pairs_to_iter(range_pairs))
}

fn filter_lemma_irregs(lemma: &Lemma, last_range: &PrefixRanges) -> Vec<usize> {
    // println!("  Checking irregs lemma: {:?}", lemma.irregular_forms);
    let irregs = match &lemma.irregular_forms {
        Some(irregs) => irregs,
        // If there are no candidates, then there cannot be any matches.
        None => return vec![],
    };
    let (start, end) = match last_range.prefix_irregs_range {
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

fn filter_lemma_stems<'a>(
    lemma: &Lemma,
    last_range: &'a PrefixRanges,
    prior_ranges: &'a [PrefixRanges],
) -> Vec<(usize, &'a str)> {
    let mut matched_stems = vec![];
    let stems = match &lemma.stems {
        Some(stems) => stems,
        None => return matched_stems,
    };
    let mut unmatched_stems = stems.iter().map(|x| *x as usize).collect::<HashSet<_>>();

    if let Some((start, end)) = last_range.prefix_stem_range {
        let mut new_unmatched_stems = HashSet::new();
        for stem_id in unmatched_stems {
            if start <= stem_id && stem_id < end {
                matched_stems.push((stem_id, &last_range.unmatched));
            } else {
                new_unmatched_stems.insert(stem_id);
            }
        }
        unmatched_stems = new_unmatched_stems;
    }

    for ranges in prior_ranges {
        let (start, end) = match ranges.exact_stem_range {
            Some(range) => range,
            None => continue,
        };
        let mut new_unmatched_stems = HashSet::new();
        for stem_id in unmatched_stems {
            if start <= stem_id && stem_id < end {
                matched_stems.push((stem_id, &ranges.unmatched));
            } else {
                new_unmatched_stems.insert(stem_id);
            }
        }
        unmatched_stems = new_unmatched_stems;
    }

    matched_stems
}

/// Finds the start and end indices of ends for the given stem that start with the given end prefix.
fn find_ends_for<'a>(
    completer: &Autocompleter<'a>,
    end_prefix: &str,
    stem: &'a Stem,
) -> Result<Option<Vec<&'a InflectionEnding>>, AutocompleteError> {
    let ends = completer.ends_for(stem)?;
    if ends.is_empty() {
        return Ok(None);
    }
    if end_prefix.is_empty() {
        return Ok(Some(ends.iter().map(|e| e.1).collect()));
    }

    let end_prefix_str = end_prefix.to_string();
    // Binary search for the first irregular form that starts with or comes after the prefix
    let start = ends.partition_point(|end| end.0 < end_prefix_str);
    if start >= ends.len() {
        return Ok(None);
    }

    let first_ending = &ends[start].0;
    if !first_ending.starts_with(end_prefix) {
        // The partition point will tell us either where the prefix actually starts,
        // or where it would be inserted. In this case, the prefix would be inserted here,
        // so there are no matching irregular forms.
        return Ok(None);
    }

    let prefix_end = ends[start..].partition_point(|end| end.0.starts_with(end_prefix));
    Ok(Some(
        ends[start..start + prefix_end]
            .iter()
            .map(|e| e.1)
            .collect(),
    ))
}

fn stem_id_to_result<'a>(
    stem_id: usize,
    unmatched: &str,
    completer: &Autocompleter<'a>,
) -> Result<Option<StemResult<'a>>, AutocompleteError> {
    let stem = &completer.tables.all_stems[stem_id];
    // println!("  Checking stem: {} | {}", stem.stem, unmatched);
    let ends = match find_ends_for(completer, unmatched, stem)? {
        // None just means there are no ends - it's not an error state.
        None => return Ok(None),
        Some(ends) if ends.is_empty() => return Ok(None),
        Some(ends) => ends,
    };
    let stem_result = StemResult {
        stem,
        ends,
        stem_id,
    };
    Ok(Some(stem_result))
}

pub(super) fn completions_for_prefix<'a>(
    prefix: &str,
    completer: &Autocompleter<'a>,
    limit: usize,
) -> Result<Vec<LemmaResult<'a>>, AutocompleteError> {
    let ranges = compute_ranges(prefix, completer.tables)?;
    let last_range = ranges
        .last()
        .ok_or("Unexpected empty prefix!".to_string())?;
    let prior_ranges = &ranges[..ranges.len().saturating_sub(1)];

    let mut results = HashMap::new();

    let lemma_ids = lemma_ids_for_ranges(last_range, prior_ranges, completer)?;
    for lemma_id in lemma_ids {
        if results.len() >= limit {
            break;
        }
        if results.contains_key(lemma_id) {
            // Prevent duplicate matches.
            continue;
        }

        let lemma = completer.lemma_from_id(*lemma_id)?;
        // println!("Checking lemma: {}", lemma.lemma);

        let mut stems = vec![];
        for (stem_id, unmatched) in filter_lemma_stems(lemma, last_range, prior_ranges) {
            match stem_id_to_result(stem_id, unmatched, completer)? {
                None => continue,
                Some(result) => stems.push(result),
            }
        }

        // 2. Then, check if we have any irregs. If so, save the Lemmata and Stems and continue,
        //    since we know the lemma has at least one matched ending.
        // 3. Otherwise, iterate through the stems until we find at least one ending that is
        //    compatible with the stem. Discard any stems that have no compatible endings.
        // 3a. If we find no such ending, skip the lemma.
        // 3b. otherwise, return the known good stem and any stems after that (which could)
        //     also contain valid endings.
        let irregs = filter_lemma_irregs(lemma, last_range)
            .into_iter()
            .map(|i| {
                let irreg = &completer.tables.all_irregs[i];
                IrregResult { irreg, irreg_id: i }
            })
            .collect::<Vec<_>>();

        if stems.is_empty() && irregs.is_empty() {
            continue;
        }

        let lemma_result = LemmaResult {
            lemma,
            stems,
            irregs,
        };
        results.insert(lemma_id, lemma_result);
    }
    Ok(results.into_values().collect())
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
