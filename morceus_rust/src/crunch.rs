use crate::{
    ambiguous_uv_ij::alternates_with_i_or_u,
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
    let mut results = crunch_exact_match(&format!("{first_char}{body}"), tables, options);

    // Special case for "V" which can be relaxed to "U" in Latin
    if first_char == 'V' {
        let relaxed_word = format!("U{body}");
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

        let relaxed_word = format!("{relaxed_first}{body}");
        for mut relaxed_result in crunch_exact_match(&relaxed_word, tables, options) {
            relaxed_result.relaxed_case = true;
            results.push(relaxed_result);
        }

        if first_char == 'V' {
            // Handle e.g. Vt -> ut.
            let relaxed_word = format!("u{body}");
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
