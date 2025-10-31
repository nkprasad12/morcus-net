use crate::completions::DisplayOptions;

const REMOVED_CHARS: [char; 4] = ['^', '-', '_', '+'];

pub(super) fn normalize_key(s: &str) -> String {
    s.to_lowercase().replace(REMOVED_CHARS, "")
}

pub(super) fn display_form(input: &str, options: &DisplayOptions) -> String {
    let breve_mark = if options.show_breves { "\u{0306}" } else { "" };
    input
        .replace(['-', '+'], "")
        .replace('^', breve_mark)
        .replace('_', "\u{0304}")
}
