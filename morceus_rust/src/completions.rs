use crate::indices::{CruncherTables, IrregularForm, Stem};

const REMOVE_CHARS: [char; 4] = ['^', '-', '_', '+'];

fn normalize_key(s: &str) -> String {
    s.to_lowercase().replace(REMOVE_CHARS, "")
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
}
