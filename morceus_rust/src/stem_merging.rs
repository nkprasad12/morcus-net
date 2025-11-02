use crate::{
    indices::{InflectionContext, InflectionEnding, Stem, StemCode},
    inflection_data::{
        LatinMood, LatinTense, extract_case_bits, extract_degree, extract_gender_bits,
        extract_mood, extract_number, extract_person, extract_tense, extract_voice,
        merge_inflection_data,
    },
};

/// Merges two optional tag lists into one, combining and deduplicating tags.
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

/// Merges grammatical data for a stem and ending for an irregular lemma, if possible.
/// Morpheus handles merging inflection data for irregular lemmata differently from regular
/// lemmata.
fn merged_context_for_irregs(stem: &Stem, ending: &InflectionEnding) -> Option<InflectionContext> {
    let merged_data = merge_inflection_data(
        stem.context.grammatical_data,
        ending.context.grammatical_data,
    )?;
    let tags = merge_tags(&stem.context.tags, &ending.context.tags);
    let internal_tags = merge_tags(&stem.context.internal_tags, &ending.context.internal_tags);
    Some(InflectionContext {
        grammatical_data: merged_data,
        tags,
        internal_tags,
    })
}

/// Merges grammatical data for a stem and ending for a regular lemma, if possible.
/// Morpheus handles merging inflection data for irregular lemmata differently from regular
/// lemmata.
fn merge_context_for_regulars(
    stem: &InflectionContext,
    ending: &InflectionContext,
) -> Option<InflectionContext> {
    let mut internal_tags_set = std::collections::HashSet::new();
    if let Some(tags) = &stem.internal_tags {
        for tag in tags {
            internal_tags_set.insert(tag.clone());
        }
    }
    if let Some(tags) = &ending.internal_tags {
        for tag in tags {
            internal_tags_set.insert(tag.clone());
        }
    }

    // Morpheus marks ends with `comp_only` if it is a compound-only
    // ending. We handle compounds differently, so just ignore these
    // for now.
    if internal_tags_set.contains("comp_only") {
        return None;
    }
    let no_fut = internal_tags_set.contains("no_fut");
    let no_fut_part = internal_tags_set.contains("no_fut_part");

    let stem_data = stem.grammatical_data;
    let ending_data = ending.grammatical_data;
    let anded_data = stem_data & ending_data;

    // We want to ensure that the stem is compatible with the ending.
    // Roughly, this can be thought of as verifying that the stem is a "subset of" the ending
    // for each inflection category (if thinking about the stem and ending as bitsets).
    // There are two cases with slight exceptions
    // - For the specific case of degree, we treat the the undefined (0) degree as compatible
    //   with the positive (1) degree, since positive is the default.
    // - For the specific case of gender, the undefined (0) gender can be treated as compatible
    //   with any gender.

    // Case is a bitset.
    let stem_case = extract_case_bits(stem_data);
    let common_case = extract_case_bits(anded_data);
    if stem_case != common_case {
        // If they're not equal, then the stem isn't a subset.
        return None;
    }

    // Gender is a bitset.
    let undef_end_gender = extract_gender_bits(ending_data) == 0;
    let stem_gender = extract_gender_bits(stem_data);
    if (stem_gender != extract_gender_bits(anded_data)) && !undef_end_gender {
        // If they're not equal, then the gender isn't a subset.
        // However, if the end gender is 0 (undefined), then Morpheus tables assume any
        // gender is allowed.
        return None;
    }

    // All other categories are not bitsets.
    let stem_mood = extract_mood(stem_data);
    let end_mood = extract_mood(ending_data);
    if stem_mood != end_mood && stem_mood != 0 {
        return None;
    }

    let stem_number = extract_number(stem_data);
    let end_number = extract_number(ending_data);
    if stem_number != end_number && stem_number != 0 {
        return None;
    }

    let stem_person = extract_person(stem_data);
    let end_person = extract_person(ending_data);
    if stem_person != end_person && stem_person != 0 {
        return None;
    }

    let stem_tense = extract_tense(stem_data);
    let end_tense = extract_tense(ending_data);
    if stem_tense != end_tense && stem_tense != 0 {
        return None;
    }

    let stem_voice = extract_voice(stem_data);
    let end_voice = extract_voice(ending_data);
    if stem_voice != end_voice && stem_voice != 0 {
        return None;
    }

    let stem_degree = extract_degree(stem_data);
    let end_degree = extract_degree(ending_data);
    if stem_degree != end_degree && stem_degree != 0 && !(stem_degree == 1 && end_degree == 0) {
        return None;
    }

    // Check additional compatibility constraints
    let is_future = end_tense == LatinTense::Future as u32;
    let is_participle = end_mood == LatinMood::Participle as u32;
    if no_fut && is_future {
        return None;
    }
    if no_fut_part && is_future && is_participle {
        return None;
    }

    // We want to make a combined result data.
    // This should provide as much narrowing as possible.
    // - For non-bitset categories, we know based on the above guard clauses that
    //   either the stem and ending have the same value or that the stem is undefined (0);
    //   in either case we can just take the ending value.
    let mut result_data = ending_data;
    // For the bitset categories which can be multiple values, we want to provide as much
    // narrowing as possible. This means that if the stem is not undefined, we take that
    // (since we checked above the stem is a subset of the ending). Otherwise, take the ending.
    if stem_case != 0 {
        result_data = (result_data & 0xFF00FFFF) | (stem_data & 0x00FF0000);
    }
    if stem_gender != 0 {
        result_data = (result_data & 0x00FFFFFF) | (stem_data & 0xFF000000);
    }

    // Build the result with the merged data and combined tags
    let internal_tags: Vec<String> = internal_tags_set.into_iter().collect();
    let internal_tags = if internal_tags.is_empty() {
        None
    } else {
        Some(internal_tags)
    };
    let tags = merge_tags(&stem.tags, &ending.tags);

    Some(InflectionContext {
        grammatical_data: result_data,
        tags,
        internal_tags,
    })
}

/// Merges grammatical data for a stem and ending, if possible.
///
/// # Arguments
/// * `stem` - The stem to merge.
/// * `end` - The inflection ending to merge.
///
/// # Returns
/// An `InflectionContext` representing the inflection data for the merged
/// result, or `None` if the stem and ending are incompatible.
pub fn merge_stem_and_ending(stem: &Stem, end: &InflectionEnding) -> Option<InflectionContext> {
    match stem.code {
        // If there's no StemCode, then this means it comes from the irregular forms table.
        StemCode::None => merged_context_for_irregs(stem, end),
        _ => merge_context_for_regulars(&stem.context, &end.context),
    }
}
