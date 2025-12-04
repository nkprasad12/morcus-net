use morceus::inflection_data::{
    LatinCase, LatinGender, LatinMood, LatinNumber, LatinPerson, LatinTense,
};

use crate::analyzer_types::LatinInflection::{
    self, {Case, Gender, Mood, Number, Person, Tense, Voice},
};

/// Whether the inflection only applies to nominal forms.
fn is_nominal_only(infl: &LatinInflection) -> bool {
    matches!(infl, LatinInflection::Case(_) | LatinInflection::Gender(_))
}

/// Whether the inflection only applies to verbal forms.
fn is_verbal_only(infl: &LatinInflection) -> bool {
    match infl {
        LatinInflection::Tense(_) => true,
        LatinInflection::Voice(_) => true,
        LatinInflection::Person(_) => true,
        LatinInflection::Mood(mood) => match mood {
            LatinMood::Imperative => true,
            LatinMood::Infinitive => true, // We don't do perphrastics yet
            LatinMood::Indicative => true,
            LatinMood::Subjunctive => true,
            // We purposely don't do a fall-through here to make sure we update
            // this in case we modify the moods.
            LatinMood::Supine => false,
            LatinMood::Participle => false,
            LatinMood::Gerundive => false,
        },
        _ => false,
    }
}

/// Whether the given mood is incompatible with the other specified inflection values.
fn is_mood_incompatible_with(
    mood: LatinMood,
    tense: Option<LatinTense>,
    case: Option<LatinCase>,
    gender: Option<LatinGender>,
    person: Option<LatinPerson>,
    number: Option<LatinNumber>,
) -> bool {
    if mood == LatinMood::Subjunctive {
        return matches!(
            tense,
            // Subjunctives do not have future tense.
            Some(LatinTense::Future) | Some(LatinTense::FuturePerfect)
        );
    }
    if mood == LatinMood::Supine {
        // Morpheus considers all supines to be neuter, so expect either that or unspecified.
        let gender_matches = matches!(gender, None | Some(LatinGender::Neuter));
        let case_matches = matches!(
            case,
            // Mopheus considers supines to be either Nominative (-um) or Accusative (-u).
            // Unspecified doesn't impose any restriction and is allowed as well.
            None | Some(LatinCase::Nominative) | Some(LatinCase::Dative)
        );
        // The result is incompatible if either mismatches.
        return !gender_matches || !case_matches;
    }
    if mood == LatinMood::Participle {
        // Participles can have case / gender / number because they are nouns.
        // They have tense and voice (active in present and future, passive in perfect).
        // But they don't have person.
        // TODO: We could add checks on the tense and voice here as well, because
        // participles don't have all combinations of tense and voice.
        return person.is_some();
    }
    if mood == LatinMood::Infinitive {
        if person.is_some() || number.is_some() {
            // Infinitives are not inflected for person or number.
            // Case and gender are handled outside of this because we mark
            // Infinitive as verbal only in `is_verbal_only`.
            return true;
        }
        // Otherwise, check that the tense is one of the incompatible ones.
        return matches!(
            tense,
            // Future infinitives exist but are periphrastic, which the analyzer does not handle yet.
            Some(LatinTense::Future)
                | Some(LatinTense::FuturePerfect)
                | Some(LatinTense::Imperfect)
                | Some(LatinTense::Pluperfect)
        );
    }
    if mood == LatinMood::Imperative {
        let tense_matches = matches!(
            tense,
            // Imperatives only exist in present and future tenses.
            None | Some(LatinTense::Present) | Some(LatinTense::Future)
        );
        return !tense_matches;
    }

    false // No incompatibility found
}

pub(super) fn is_conjunction_impossible(terms: &[LatinInflection]) -> bool {
    if terms.iter().any(is_nominal_only) && terms.iter().any(is_verbal_only) {
        // Some condition applies only to nominals, and some other one applies only to verbals.
        // No one token can be both.
        return true;
    }

    let mut case = None;
    let mut number = None;
    let mut gender = None;
    let mut person = None;
    let mut mood = None;
    let mut voice = None;
    let mut tense = None;

    macro_rules! set_or_check_conflict {
        ($field:ident, $value:expr) => {
            if let Some(existing) = $field {
                if $value != existing {
                    // This means that two terms are looking for the
                    // same category but different values, e.g. Nominative
                    // and Accusative on the same token.
                    return true;
                }
            } else {
                $field = Some($value);
            }
        };
    }

    for term in terms {
        match term {
            Case(c) => set_or_check_conflict!(case, *c),
            Number(n) => set_or_check_conflict!(number, *n),
            Gender(g) => set_or_check_conflict!(gender, *g),
            Person(p) => set_or_check_conflict!(person, *p),
            Mood(m) => set_or_check_conflict!(mood, *m),
            Voice(v) => set_or_check_conflict!(voice, *v),
            Tense(t) => set_or_check_conflict!(tense, *t),
            LatinInflection::Degree(_) => {}
        };
    }

    let mood = match mood {
        // All of the remaining ways to be impossible require a mood.
        None => return false,
        Some(m) => m,
    };

    is_mood_incompatible_with(mood, tense, case, gender, person, number)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nominal_and_verbal_conflict() {
        // Case (nominal) + Tense (verbal) should be impossible
        assert!(is_conjunction_impossible(&[
            Case(LatinCase::Nominative),
            Tense(LatinTense::Present)
        ]));

        // Gender (nominal) + Person (verbal) should be impossible
        assert!(is_conjunction_impossible(&[
            Gender(LatinGender::Masculine),
            Person(LatinPerson::First)
        ]));
    }

    #[test]
    fn test_conflicting_same_category() {
        // Two different cases
        assert!(is_conjunction_impossible(&[
            Case(LatinCase::Nominative),
            Case(LatinCase::Accusative)
        ]));

        // Two different numbers
        assert!(is_conjunction_impossible(&[
            Number(LatinNumber::Singular),
            Number(LatinNumber::Plural)
        ]));

        // Two different genders
        assert!(is_conjunction_impossible(&[
            Gender(LatinGender::Masculine),
            Gender(LatinGender::Feminine)
        ]));

        // Two different persons
        assert!(is_conjunction_impossible(&[
            Person(LatinPerson::First),
            Person(LatinPerson::Second)
        ]));

        // Two different moods
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Indicative),
            Mood(LatinMood::Subjunctive)
        ]));

        // Two different tenses
        assert!(is_conjunction_impossible(&[
            Tense(LatinTense::Present),
            Tense(LatinTense::Imperfect)
        ]));
    }

    #[test]
    fn test_subjunctive_incompatibilities() {
        // Subjunctive + Future tense is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Subjunctive),
            Tense(LatinTense::Future)
        ]));

        // Subjunctive + Future Perfect tense is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Subjunctive),
            Tense(LatinTense::FuturePerfect)
        ]));

        // Subjunctive + Present tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Subjunctive),
            Tense(LatinTense::Present)
        ]));

        // Subjunctive + Imperfect tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Subjunctive),
            Tense(LatinTense::Imperfect)
        ]));
    }

    #[test]
    fn test_supine_incompatibilities() {
        // Supine with non-neuter gender is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Supine),
            Gender(LatinGender::Masculine)
        ]));

        // Supine with neuter gender is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Supine),
            Gender(LatinGender::Neuter)
        ]));

        // Supine with invalid case (not Nominative or Dative) is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Supine),
            Case(LatinCase::Genitive)
        ]));

        // Supine with Nominative case is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Supine),
            Case(LatinCase::Nominative)
        ]));

        // Supine with Dative case is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Supine),
            Case(LatinCase::Dative)
        ]));
    }

    #[test]
    fn test_participle_incompatibilities() {
        // Participle with person is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Participle),
            Person(LatinPerson::First)
        ]));

        // Participle with case, gender, number is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Participle),
            Case(LatinCase::Nominative),
            Gender(LatinGender::Masculine),
            Number(LatinNumber::Singular)
        ]));

        // Participle with tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Participle),
            Tense(LatinTense::Present)
        ]));
    }

    #[test]
    fn test_infinitive_incompatibilities() {
        // Infinitive with person is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Person(LatinPerson::First)
        ]));

        // Infinitive with number is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Number(LatinNumber::Singular)
        ]));

        // Infinitive with Future tense is impossible (periphrastic)
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::Future)
        ]));

        // Infinitive with FuturePerfect is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::FuturePerfect)
        ]));

        // Infinitive with Imperfect is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::Imperfect)
        ]));

        // Infinitive with Pluperfect is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::Pluperfect)
        ]));

        // Infinitive with Present tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::Present)
        ]));

        // Infinitive with Perfect tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Infinitive),
            Tense(LatinTense::Perfect)
        ]));
    }

    #[test]
    fn test_imperative_incompatibilities() {
        // Imperative with non-present/future tense is impossible
        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Imperative),
            Tense(LatinTense::Imperfect)
        ]));

        assert!(is_conjunction_impossible(&[
            Mood(LatinMood::Imperative),
            Tense(LatinTense::Perfect)
        ]));

        // Imperative with Present tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Imperative),
            Tense(LatinTense::Present)
        ]));

        // Imperative with Future tense is valid
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Imperative),
            Tense(LatinTense::Future)
        ]));
    }

    #[test]
    fn test_valid_combinations() {
        // Valid nominal combinations
        assert!(!is_conjunction_impossible(&[
            Case(LatinCase::Nominative),
            Number(LatinNumber::Singular),
            Gender(LatinGender::Masculine)
        ]));

        // Valid verbal combinations
        assert!(!is_conjunction_impossible(&[
            Mood(LatinMood::Indicative),
            Tense(LatinTense::Present),
            Person(LatinPerson::First),
            Number(LatinNumber::Singular)
        ]));

        // Empty list is valid
        assert!(!is_conjunction_impossible(&[]));

        // Single inflection is valid
        assert!(!is_conjunction_impossible(&[Case(LatinCase::Nominative)]));
    }

    #[test]
    fn test_duplicate_same_value() {
        // Same case twice should be valid (no conflict)
        assert!(!is_conjunction_impossible(&[
            Case(LatinCase::Nominative),
            Case(LatinCase::Nominative)
        ]));

        // Same number twice should be valid
        assert!(!is_conjunction_impossible(&[
            Number(LatinNumber::Singular),
            Number(LatinNumber::Singular)
        ]));
    }
}
