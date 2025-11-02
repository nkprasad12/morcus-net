use crate::{
    indices::{CrunchResult, CruncherOptions, CruncherTables, StemMapValue},
    stem_merging::merge_stem_and_ending,
};

const ENCLITICS: [&str; 3] = ["que", "ne", "ve"];

/// Returns the substring of `s` from character index `start` (inclusive) to `end` (exclusive).
fn substring_chars(s: &str, start: usize, end: usize) -> &str {
    let start_byte = s
        .char_indices()
        .nth(start)
        .map(|(b, _)| b)
        .unwrap_or(s.len());
    let end_byte = s.char_indices().nth(end).map(|(b, _)| b).unwrap_or(s.len());
    &s[start_byte..end_byte]
}

fn crunch_options_for_end(
    raw_end: &str,
    tables: &CruncherTables,
    candidates: &Vec<StemMapValue>,
) -> Vec<CrunchResult> {
    let observed_end = if raw_end.is_empty() { "*" } else { raw_end };
    let mut results = Vec::new();

    let possible_ends = match tables.ends_map.get(observed_end) {
        Some(pe) => pe,
        // There are no matches for this end, but we may still have an
        // exact match with an indeclinable form.
        None => &vec![],
    };

    for StemMapValue {
        index,
        lemma,
        is_stem,
        is_verb,
    } in candidates
    {
        if !*is_stem {
            let form = &tables.all_irregs[*index as usize];
            assert!(form.code.is_indeclinable() || form.code.is_none());
            // If it's indeclinable, then we skip if it the expected ending is not empty
            // (since there's no inflected ending to bridge the gap). Otherwise, since it
            // is not inflected, we don't need to do any further compatibility checks
            // like we do between stems and endings.
            if observed_end != "*" {
                continue;
            }
            results.push(CrunchResult {
                lemma: lemma.clone(),
                form: form.form.clone(),
                stem: None,
                end: None,
                is_verb: *is_verb,
                relaxed_case: false,
                relaxed_vowel_lengths: false,
                context: form.context.clone(),
                enclitic: None,
            });
            continue;
        }
        let stem = &tables.all_stems[*index as usize];
        assert!(!stem.code.is_indeclinable() || stem.code.is_none());
        // Check to make sure there's a template that could have a match.
        if !possible_ends.contains(&stem.inflection) {
            continue;
        }
        let possible_ends = tables
            .inflection_lookup
            .get(stem.inflection as usize)
            .unwrap()
            .get(observed_end)
            .unwrap();
        for end in possible_ends {
            let merged_data = match merge_stem_and_ending(stem, end) {
                Some(md) => md,
                None => continue,
            };
            // * is the placeholder for an empty ending.
            let ending = if end.ending == "*" { "" } else { &end.ending };
            results.push(CrunchResult {
                lemma: lemma.clone(),
                form: format!("{}{}", stem.stem, ending),
                stem: Some(stem.clone()),
                end: Some(end.clone()),
                is_verb: *is_verb,
                relaxed_case: false,
                relaxed_vowel_lengths: false,
                context: merged_data,
                enclitic: None,
            });
        }
    }

    results
}

fn crunch_exact_match(
    word: &str,
    tables: &CruncherTables,
    options: &CruncherOptions,
) -> Vec<CrunchResult> {
    let mut results: Vec<CrunchResult> = Vec::new();
    let char_count = word.chars().count();

    for i in 0..=char_count {
        let prefix = substring_chars(word, 0, i);
        let candidates = match tables.stem_map.get(prefix) {
            Some(c) => c,
            None => continue,
        };

        let full_end = substring_chars(word, i, char_count);
        // Append direct matches for this split
        results.extend(crunch_options_for_end(full_end, tables, candidates));

        if !options.handle_enclitics {
            continue;
        }
        for &enclitic in ENCLITICS.iter() {
            if !full_end.ends_with(enclitic) {
                continue;
            }
            // compute partial end by removing the enclitic's characters
            let enclitic_len = enclitic.chars().count();
            let partial_end = substring_chars(word, i, char_count - enclitic_len);

            let mut partial_results = crunch_options_for_end(partial_end, tables, candidates);
            // annotate with enclitic and append
            for mut r in partial_results.drain(..) {
                r.enclitic = Some(enclitic.to_string());
                results.push(r);
            }
        }
    }

    results
}

fn crunch_and_maybe_relax_case(
    word: &str,
    tables: &CruncherTables,
    options: &CruncherOptions,
) -> Vec<CrunchResult> {
    // Split the word into first character and rest
    let mut chars = word.chars();
    let first_char = match chars.next() {
        Some(c) => c,
        None => return Vec::new(), // Handle empty string case
    };
    let body = chars.collect::<String>().to_lowercase();

    // Process with original case (first character + lowercase rest)
    let mut results = crunch_exact_match(&format!("{}{}", first_char, body), tables, options);

    // Special case for "V" which can be relaxed to "U" in Latin
    if first_char == 'V' {
        let relaxed_word = format!("U{}", body);
        for mut relaxed_result in crunch_exact_match(&relaxed_word, tables, options) {
            // This is marked for compatibility with the Typescript implementation,
            // but it doesn't really make sense if you think about it, since we just
            // mapped an upper case to an upper case.
            relaxed_result.relaxed_case = true;
            results.push(relaxed_result);
        }
    }

    // Handle general case relaxation if option enabled
    if options.relax_case {
        let is_upper = first_char.is_uppercase();
        let relaxed_first = if is_upper {
            first_char.to_lowercase().next().unwrap_or(first_char)
        } else {
            first_char.to_uppercase().next().unwrap_or(first_char)
        };

        let relaxed_word = format!("{}{}", relaxed_first, body);
        for mut relaxed_result in crunch_exact_match(&relaxed_word, tables, options) {
            relaxed_result.relaxed_case = true;
            results.push(relaxed_result);
        }

        if first_char == 'V' {
            // Handle e.g. Vt -> ut.
            let relaxed_word = format!("u{}", body);
            for mut relaxed_result in crunch_exact_match(&relaxed_word, tables, options) {
                // This is marked for compatibility with the Typescript implementation,
                // but it doesn't really make sense if you think about it, since we just
                // mapped an upper case to an upper case.
                relaxed_result.relaxed_case = true;
                results.push(relaxed_result);
            }
        }
    }

    results
}

/// Returns whether the character is a vowel in Latin
fn is_vowel(c: char) -> bool {
    matches!(
        c,
        'a' | 'e' | 'i' | 'o' | 'u' | 'y' | 'A' | 'E' | 'I' | 'O' | 'U' | 'Y'
    )
}

/// Returns the indices of the possible ambiguous `i` and `u` characters.
///
/// @param word the input, which must not have any combining characters.
/// @param try_i whether to check for ambiguous `i`.
/// @param try_u whether to check for ambiguous 'u'.
///
/// @returns the (0 based) indices of the possible ambiguous characters.
fn find_ambiguous_i_and_u(word: &str, try_i: bool, try_u: bool) -> Vec<usize> {
    if !try_i && !try_u {
        return vec![];
    }

    // We do not remove diacitics here on purpose because and i or u with
    // a macron definitely is not a consonant.
    let clean_word = word.to_lowercase();
    let chars: Vec<char> = clean_word.chars().collect();
    let orig_chars: Vec<char> = word.chars().collect();
    let n = chars.len();

    let mut mark_u = try_u;
    let mut mark_i = try_i;
    let mut is_vowel_table = vec![false; n];

    for i in 0..n {
        let c = chars[i];
        is_vowel_table[i] = is_vowel(c);
        // If the word has a `j`, we assume `i` is only used as a vowel.
        if c == 'j' {
            mark_i = false;
        }
        // If the word has a `v`, assume that `v` is only used as a vowel.
        // Note that some conventions use `V` for capital `u`, so we don't consider
        // capital `V` here.
        if orig_chars[i] == 'v' {
            mark_u = false;
        }
    }

    if !mark_i && !mark_u {
        return vec![];
    }

    let mut result = Vec::new();
    for i in 0..n {
        let after_vowel = i >= 1 && is_vowel_table[i - 1];
        let before_vowel = i < n - 1 && is_vowel_table[i + 1];
        if !after_vowel && !before_vowel {
            continue;
        }

        let c = chars[i];
        // Ignore `u` if after `q`, since `qu` is a digraph and `q` is never
        // used without `u`.
        let not_after_q = i == 0 || chars[i - 1] != 'q';
        if (mark_i && c == 'i') || (mark_u && c == 'u' && not_after_q) {
            result.push(i);
        }
    }

    result
}

/// Generate variants of the word with possible ambiguous `i` and `u` characters.
///
/// Returns alternate spellings with consonental i or u as specified.
fn alternates_with_i_or_u(word: &str, try_i: bool, try_u: bool) -> Vec<String> {
    let ambigs = find_ambiguous_i_and_u(word, try_i, try_u);
    if ambigs.is_empty() {
        return vec![];
    }

    let mut results = Vec::new();
    let n = ambigs.len();
    let total_alternates = 1 << n;

    let word_chars: Vec<char> = word.chars().collect();
    // Skip the all false case since that is just the original string.
    for mask in 1..total_alternates {
        let mut modified_chars = word_chars.clone();
        for (i, idx) in ambigs.iter().enumerate() {
            if (mask & (1 << i)) != 0 {
                let idx = *idx;
                let c = word_chars[idx];
                let modified_current = match c {
                    'i' => 'j',
                    'I' => 'J',
                    'u' => 'v',
                    'U' => 'V',
                    _ => c,
                };
                modified_chars[idx] = modified_current;
            }
        }
        results.push(modified_chars.iter().collect());
    }

    results
}

/// Process a Latin word and return all possible morphological analyses.
///
/// @param word The input word to analyze
/// @param tables Morphological database tables for lookups
/// @param options Configuration options for the analysis
pub fn crunch_word(
    word: &str,
    tables: &CruncherTables,
    options: &CruncherOptions,
) -> Vec<CrunchResult> {
    // Note: In the full implementation we would need to handle combining characters
    // (macron/breve markers) here, but for simplicity we'll assume the word is already
    // normalized and has no combining characters
    for c in word.chars() {
        if !c.is_ascii_alphabetic() {
            return vec![];
        }
    }

    // First analyze the word as-is
    let mut results = vec![crunch_and_maybe_relax_case(word, tables, options)];

    // Then generate and analyze alternates with different i/j or u/v spellings if enabled
    if options.relax_i_and_j || options.relax_u_and_v {
        let alternates = alternates_with_i_or_u(word, options.relax_i_and_j, options.relax_u_and_v);
        for alternate in alternates {
            results.push(crunch_and_maybe_relax_case(&alternate, tables, options));
        }
    }
    // Flatten all results into a single vector
    let flattened: Vec<CrunchResult> = results.into_iter().flatten().collect();
    if options.skip_consolidation {
        return flattened;
    }
    unimplemented!()
}
