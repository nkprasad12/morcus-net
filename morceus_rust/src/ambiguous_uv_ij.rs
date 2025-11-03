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
pub fn alternates_with_i_or_u(word: &str, try_i: bool, try_u: bool) -> Vec<String> {
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
