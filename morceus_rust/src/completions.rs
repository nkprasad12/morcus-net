use crate::indices::CruncherTables;

pub fn completions_for(prefix: &str, tables: &CruncherTables) -> Vec<String> {
    let mut completions = Vec::new();
    for stem in &tables.all_stems {
        if stem.stem.starts_with(prefix) {
            completions.push(stem.stem.clone());
        }
    }
    completions
}
