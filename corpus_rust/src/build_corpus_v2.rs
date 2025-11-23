mod library_utils;
mod string_processing;

use std::{fs, time::Instant};

use morceus::{
    crunch::crunch_word,
    indices::{CrunchResult, CruncherOptions, CruncherTables},
};

use crate::build_corpus_v2::{
    library_utils::{
        CorpusInputWork, LIB_CORPUS_INPUT_DIR, LIB_INDEX_PATH, find_files_from_library_index,
    },
    string_processing::process_tokens,
};

const TABLES_FILE: &str = "build/morceus/processed/morceusTables.json";

fn load_tables(filename: &str) -> Result<CruncherTables, Box<dyn std::error::Error>> {
    // Read the JSON file
    let json_content = fs::read_to_string(filename).map_err(|err| {
        eprintln!("Error reading file '{filename}': {err}");
        Box::new(err)
    })?;

    // Parse CruncherTables from JSON
    let cruncher_tables: CruncherTables = serde_json::from_str(&json_content).map_err(|err| {
        eprintln!("Error parsing JSON from '{filename}': {err}");
        Box::new(err)
    })?;
    Ok(cruncher_tables)
}

// Main function to absorb a work into the corpus
fn absorb_work<'a>(
    work: &'a CorpusInputWork,
    get_inflections: impl Fn(&str) -> Vec<CrunchResult>,
    tokens: &mut Vec<&'a str>,
    breaks: &mut Vec<&'a str>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "Ingesting into corpus: {} ({}) - {}",
        work.work_name, work.author, work.id
    );
    for (row_idx, row_text) in work.rows.iter().enumerate() {
        let _row_ids = &work.row_ids[row_idx];
        for (substr, is_word) in process_tokens(row_text) {
            if !is_word {
                breaks.push(substr);
                continue;
            }
            tokens.push(substr);
            get_inflections(substr);
        }
    }
    Ok(())
}

pub fn build_corpus() -> Result<(), Box<dyn std::error::Error>> {
    let corpus_files = find_files_from_library_index(LIB_INDEX_PATH, LIB_CORPUS_INPUT_DIR)?;
    let mut works = vec![];
    for file_path in &corpus_files {
        let work = CorpusInputWork::from_file(file_path)?;
        works.push(work);
    }

    let tables = load_tables(TABLES_FILE)?;
    let crunch_options = CruncherOptions::default();
    let get_inflections = |word: &str| crunch_word(word, &tables, &crunch_options);

    let start_time = Instant::now();

    let mut tokens: Vec<&str> = Vec::new();
    let mut breaks: Vec<&str> = Vec::new();

    for work in &works {
        absorb_work(work, get_inflections, &mut tokens, &mut breaks)?;
    }

    println!("Corpus build took {:?}", start_time.elapsed());
    println!("Tokens: {}", tokens.len());
    fs::write("tokens.rs.txt", tokens.join("\n"))?;
    println!("Breaks: {}", breaks.len());

    Ok(())
}
