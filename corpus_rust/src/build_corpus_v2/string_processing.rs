fn is_text_break_char(c: char) -> bool {
    " ()[];:.,?!'\n\t—\"†‘“”’<>".contains(c)
}

pub fn process_tokens(input: &str) -> Vec<(&str, bool)> {
    let mut result = Vec::new();
    let mut is_in_word = match input.chars().next() {
        Some(c) => !is_text_break_char(c),
        None => return result,
    };
    let mut last_start = 0;

    for (i, c) in input.char_indices() {
        let current_is_in_word = !is_text_break_char(c);
        let state_change = current_is_in_word != is_in_word;
        if !state_change {
            continue;
        }
        result.push((&input[last_start..i], is_in_word));
        last_start = i;
        is_in_word = current_is_in_word;
    }
    if last_start < input.len() {
        let token = &input[last_start..];
        result.push((token, is_in_word));
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        let result = process_tokens("");
        assert_eq!(result, vec![]);
    }

    #[test]
    fn test_single_word() {
        let result = process_tokens("hello");
        assert_eq!(result, vec![("hello", true)]);
    }

    #[test]
    fn test_single_punctuation() {
        let result = process_tokens(".");
        assert_eq!(result, vec![(".", false)]);
    }

    #[test]
    fn test_word_with_punctuation() {
        let result = process_tokens("hello.");
        assert_eq!(result, vec![("hello", true), (".", false)]);
    }

    #[test]
    fn test_multiple_words_with_spaces() {
        let result = process_tokens("hello world");
        assert_eq!(result, vec![("hello", true), (" ", false), ("world", true)]);
    }

    #[test]
    fn test_sentence_with_punctuation() {
        let result = process_tokens("Hello, world!");
        assert_eq!(
            result,
            vec![
                ("Hello", true),
                (", ", false),
                ("world", true),
                ("!", false)
            ]
        );
    }

    #[test]
    fn test_parentheses_and_brackets() {
        let result = process_tokens("(hello)[world]");
        assert_eq!(
            result,
            vec![
                ("(", false),
                ("hello", true),
                (")[", false),
                ("world", true),
                ("]", false)
            ]
        );
    }

    #[test]
    fn test_newline_and_tab() {
        let result = process_tokens("hello\n\tworld");
        assert_eq!(
            result,
            vec![("hello", true), ("\n\t", false), ("world", true)]
        );
    }

    #[test]
    fn test_starting_with_punctuation() {
        let result = process_tokens("...hello");
        assert_eq!(result, vec![("...", false), ("hello", true)]);
    }
}
