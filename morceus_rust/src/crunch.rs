use crate::{
    indices::{
        CrunchResult, CruncherOptions, CruncherTables, InflectionContext, InflectionEnding, Stem,
        StemCode, StemMapValue, StemOrForm,
    },
    inflection_data::merge_inflection_data,
};

const ENCLITICS: [&str; 3] = ["que", "ne", "ve"];

fn merge_tags(
    template: &Option<Vec<String>>,
    modifier: &Option<Vec<String>>,
) -> Option<Vec<String>> {
    match (template, modifier) {
        (Some(t), Some(m)) => {
            let mut merged = t.clone();
            for tag in m {
                if !merged.contains(tag) {
                    merged.push(tag.clone());
                }
            }
            Some(merged)
        }
        (Some(t), None) => Some(t.clone()),
        (None, Some(m)) => Some(m.clone()),
        (None, None) => None,
    }
}

fn expand_single_ending(stem: &Stem, ending: &InflectionEnding) -> Option<InflectionEnding> {
    let merged_data = merge_inflection_data(
        stem.context.grammatical_data,
        ending.context.grammatical_data,
    )?;
    let tags = merge_tags(&stem.context.tags, &ending.context.tags);
    let internal_tags = merge_tags(&stem.context.internal_tags, &ending.context.internal_tags);
    let ending = format!("{}{}", stem.stem, ending.ending);
    Some(InflectionEnding {
        ending,
        context: InflectionContext {
            grammatical_data: merged_data,
            tags,
            internal_tags,
        },
    })
}

fn merge_if_compatible(
    stem: &InflectionContext,
    end: &InflectionContext,
) -> Option<InflectionContext> {
    Some(stem.clone())
}

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
        stem_or_form,
        lemma,
        is_verb,
    } in candidates
    {
        match stem_or_form {
            StemOrForm::IrregularForm(form) => {
                assert!(!form.code.is_inclinable() || form.code.is_none());
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
            }
            StemOrForm::Stem(stem) => {
                assert!(stem.code.is_inclinable() || stem.code.is_none());
                // Check to make sure there's a template that could have a match.
                if !possible_ends.contains(&stem.inflection) {
                    continue;
                }
                let possible_ends = tables
                    .inflection_lookup
                    .get(stem.inflection.as_str())
                    .unwrap()
                    .get(observed_end)
                    .unwrap();
                for end in possible_ends {
                    let merged_data = match stem.code {
                        // If there's no StemCode, then this means it comes from the
                        // irregular forms table and we need to expand the endings.
                        StemCode::None => expand_single_ending(stem, end).map(|e| e.context),
                        _ => merge_if_compatible(&stem.context, &end.context),
                    };
                    let merged_data = match merged_data {
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
        }
    }

    results
}

pub fn crunch_exact_match(
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
