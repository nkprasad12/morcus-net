const REMOVED_CHARS: [char; 4] = ['^', '-', '_', '+'];

pub(super) fn normalize_key(s: &str) -> String {
    s.to_lowercase().replace(REMOVED_CHARS, "")
}
