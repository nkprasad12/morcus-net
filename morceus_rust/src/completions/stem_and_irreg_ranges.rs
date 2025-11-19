use crate::{
    completions::{AutocompleteError, string_utils::normalize_key},
    indices::{CruncherTables, IrregularForm, Stem},
};

pub(super) struct PrefixRanges {
    /// The range of stems for which the prefix is totally contained in the stem.
    ///
    /// The start is inclusive, the end is exclusive.
    ///
    /// For example, if we have stems \["apple", "application", "apps"\],
    /// and the prefix is `"appl"`, then the range would be (0, 2).
    pub(super) stem_range: Option<(usize, usize)>,
    /// The range of irregular forms for which the prefix is totally contained in the form.
    ///
    /// The start is inclusive, the end is exclusive.
    /// For example, if we have irregular forms \["est", "esse", "estimo"\],
    /// and the prefix is `"es"`, then the range would be (0, 3).
    pub(super) irregs_range: Option<(usize, usize)>,
    /// The ranges of stems for which the stem and the prefix share some common
    /// sub-prefix, but not a full match. These are included because they may still
    /// yield matches when combined with endings. The result represents the part of
    /// the prefix that was not matched.
    ///
    /// The start is inclusive, the end is exclusive.
    ///
    /// For example, if we have stems \["app", "appl", "apple"\],
    /// and the prefix is `"apple"`, the the result would be:
    /// \[((0, 1), "le"), ((1, 2), "e")  \]
    ///
    /// Note that "apple" is not included because it has a full match for the prefix,
    /// and would instead be included in `stem_range`.
    pub(super) partial_stem_ranges: Vec<((usize, usize), String)>,
}

/// Macro to generate both owned and borrowed versions of find_ranges_of
macro_rules! impl_find_ranges_of {
    ($fn_name:ident, $key_type:ty, $key_extractor_ret:ty) => {
        /// Finds the start and end indices of items starting with or matching the given prefix.
        ///
        /// # Arguments
        /// * `word_or_prefix` - The normalized prefix (or word) to match. Must not be empty.
        /// * `exact_only` - Whether to look for exact matches (true) or prefix matches (false).
        /// * `items` - The list of items to search. The items should be in sorted order, keyed
        ///   by the `key_extractor` function and normalized by `normalize_key`.
        /// * `key_extractor` - A function that extracts the string key from an item.
        ///
        /// # Returns
        /// Ranges of matches for the prefix.
        pub(super) fn $fn_name<T>(
            word_or_prefix: &str,
            exact_only: bool,
            items: &[T],
            key_extractor: impl Fn(&T) -> $key_extractor_ret,
        ) -> Option<(usize, usize)> {
            if items.is_empty() || word_or_prefix.is_empty() {
                return None;
            }

            // Binary search for the first item that starts with or comes after the prefix or word.
            let start = items.partition_point(|item| {
                let key = key_extractor(item);
                let key_ref: &str = key.as_ref();
                key_ref < word_or_prefix
            });
            if start >= items.len() {
                return None;
            }

            let start_key: $key_type = key_extractor(&items[start]).into();
            if (exact_only && start_key != word_or_prefix)
                || (!exact_only && !start_key.starts_with(word_or_prefix))
            {
                // The partition point will tell us either where the range of interest actually starts,
                // or where the point would be if there was an exact match.
                // In this case, either we:
                // - Are seeking exact matches only, and there is no exact match.
                // - Are seeking prefix matches, and there is no prefix match.
                // so we can return None.
                return None;
            }

            let range_end = match exact_only {
                // If we only care about exact matches, find the partition point where the exact matches end.
                true => items[start..].partition_point(|item| {
                    let key = key_extractor(item);
                    let key_ref: &str = key.as_ref();
                    key_ref == word_or_prefix
                }),
                // If we want any prefix match, find the partition point where the prefix matches end.
                false => items[start..].partition_point(|item| {
                    let key = key_extractor(item);
                    let key_ref: &str = key.as_ref();
                    key_ref.starts_with(word_or_prefix)
                }),
            };
            Some((start, start + range_end))
        }
    };
}

impl_find_ranges_of!(find_ranges_of, String, String);
impl_find_ranges_of!(find_ranges_of_borrowed, &str, &str);

#[inline]
fn extract_stem_key(stem: &Stem) -> String {
    normalize_key(&stem.stem)
}

fn find_stem_ranges(prefix: &str, stems: &[Stem], exact_only: bool) -> Option<(usize, usize)> {
    find_ranges_of(prefix, exact_only, stems, extract_stem_key)
}

#[inline]
fn extract_irreg_key(irreg: &IrregularForm) -> String {
    normalize_key(&irreg.form)
}

fn find_irreg_ranges(
    prefix: &str,
    irregs: &[IrregularForm],
    exact_only: bool,
) -> Option<(usize, usize)> {
    find_ranges_of(prefix, exact_only, irregs, extract_irreg_key)
}

pub(super) fn compute_ranges_for(
    prefix: &str,
    tables: &CruncherTables,
    exact_only: bool,
) -> Result<PrefixRanges, AutocompleteError> {
    let prefix = normalize_key(prefix);
    if !prefix.is_ascii() {
        return Err("Only ASCII prefixes are supported.".to_string());
    }
    if prefix.is_empty() {
        return Err("Empty prefixes are not allowed.".to_string());
    }

    let stem_range = find_stem_ranges(&prefix, &tables.all_stems, exact_only);
    let irregs_range = find_irreg_ranges(&prefix, &tables.all_irregs, exact_only);
    let mut partial_stem_ranges = vec![];
    // Note that we start at 1 because we don't care about the empty prefix.
    // We can just use the byte length because we verified above that it's ASCII.
    for i in 1..prefix.len() {
        // Similarly, we can just index on the bytes because we know it's ASCII.
        let prefix_so_far = &prefix[..i];
        let stem_range = match find_stem_ranges(prefix_so_far, &tables.all_stems, true) {
            None => continue,
            Some(range) => range,
        };
        let unmatched = &prefix[i..];
        partial_stem_ranges.push((stem_range, unmatched.to_string()));
    }

    Ok(PrefixRanges {
        stem_range,
        irregs_range,
        partial_stem_ranges,
    })
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

        assert_eq!(find_stem_ranges("test", &stems, false), None);
        assert_eq!(find_stem_ranges("test", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_empty_prefix() {
        let stems = vec![create_stem("test")];

        assert_eq!(find_stem_ranges("test", &stems, false), None);
        assert_eq!(find_stem_ranges("test", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_single_match() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banana"),
            create_stem("cherry"),
        ];

        assert_eq!(find_stem_ranges("banana", &stems, false), Some((1, 2)));
        assert_eq!(find_stem_ranges("banana", &stems, true), Some((1, 2)));
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

        assert_eq!(find_stem_ranges("app", &stems, false), Some((1, 4)));
        assert_eq!(find_stem_ranges("app", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_prefix_before_all() {
        let stems = vec![
            create_stem("banana"),
            create_stem("cherry"),
            create_stem("date"),
        ];

        assert_eq!(find_stem_ranges("apple", &stems, false), None);
        assert_eq!(find_stem_ranges("apple", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_prefix_after_all() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banana"),
            create_stem("cherry"),
        ];

        assert_eq!(find_stem_ranges("zebra", &stems, false), None);
        assert_eq!(find_stem_ranges("zebra", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_case_insensitive() {
        let stems = vec![
            create_stem("Apple"),
            create_stem("BANANA"),
            create_stem("Cherry"),
        ];

        assert_eq!(find_stem_ranges("app", &stems, false), Some((0, 1)));
        assert_eq!(find_stem_ranges("app", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_with_special_chars() {
        let stems = vec![
            create_stem("a^pple"),
            create_stem("app-le"),
            create_stem("app_lication"),
            create_stem("banana"),
        ];

        assert_eq!(find_stem_ranges("appl", &stems, false), Some((0, 3)));
        assert_eq!(find_stem_ranges("appl", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_with_multiple_exact_matches() {
        let stems = vec![
            create_stem("a^pple"),
            create_stem("app-le"),
            create_stem("app_lication"),
            create_stem("banana"),
        ];

        assert_eq!(find_stem_ranges("apple", &stems, false), Some((0, 2)));
        assert_eq!(find_stem_ranges("apple", &stems, true), Some((0, 2)));
    }

    #[test]
    fn test_find_stem_ranges_partial_match_at_end() {
        let stems = vec![
            create_stem("apple"),
            create_stem("banan"),
            create_stem("candy"),
        ];

        assert_eq!(find_stem_ranges("cand", &stems, false), Some((2, 3)));
        assert_eq!(find_stem_ranges("cand", &stems, true), None);
    }

    #[test]
    fn test_find_stem_ranges_exact_match() {
        let stems = vec![
            create_stem("test"),
            create_stem("tester"),
            create_stem("testing"),
        ];

        assert_eq!(find_stem_ranges("test", &stems, false), Some((0, 3)));
        assert_eq!(find_stem_ranges("test", &stems, true), Some((0, 1)));
    }

    #[test]
    fn test_find_irreg_ranges_empty_irregs() {
        let irregs: Vec<IrregularForm> = vec![];
        let result = find_irreg_ranges("test", &irregs, false);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_empty_prefix() {
        let irregs = vec![create_irreg("test")];
        let result = find_irreg_ranges("", &irregs, false);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_single_match() {
        let irregs = vec![
            create_irreg("est"),
            create_irreg("sum"),
            create_irreg("sunt"),
        ];
        let result = find_irreg_ranges("sum", &irregs, false);

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
        let result = find_irreg_ranges("est", &irregs, false);

        assert_eq!(result, Some((2, 4)));
    }

    #[test]
    fn test_find_irreg_ranges_prefix_before_all() {
        let irregs = vec![
            create_irreg("est"),
            create_irreg("sum"),
            create_irreg("sunt"),
        ];
        let result = find_irreg_ranges("abc", &irregs, false);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_prefix_after_all() {
        let irregs = vec![create_irreg("es"), create_irreg("est"), create_irreg("sum")];
        let result = find_irreg_ranges("xyz", &irregs, false);

        assert_eq!(result, None);
    }

    #[test]
    fn test_find_irreg_ranges_case_insensitive() {
        let irregs = vec![
            create_irreg("Est"),
            create_irreg("SUM"),
            create_irreg("Sunt"),
        ];
        let result = find_irreg_ranges("es", &irregs, false);

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
        let result = find_irreg_ranges("es", &irregs, false);

        assert_eq!(result, Some((0, 3)));
    }

    #[test]
    fn test_find_irreg_ranges_partial_match_at_end() {
        let irregs = vec![create_irreg("es"), create_irreg("est"), create_irreg("sun")];
        let result = find_irreg_ranges("su", &irregs, false);

        assert_eq!(result, Some((2, 3)));
    }

    #[test]
    fn test_find_irreg_ranges_no_match_in_middle() {
        let irregs = vec![
            create_irreg("abc"),
            create_irreg("def"),
            create_irreg("xyz"),
        ];
        let result = find_irreg_ranges("ghi", &irregs, false);

        assert_eq!(result, None);
    }
}
