use std::{fs, time::Instant};

use morceus::{
    crunch::crunch_word,
    indices::{CruncherOptions, CruncherTables},
};

use crate::build_corpus_v2::library_utils::{
    CorpusInputWork, LIB_CORPUS_INPUT_DIR, LIB_INDEX_PATH, find_files_from_library_index,
};

mod library_utils;

const TABLES_FILE: &str = "build/morceus/processed/morceusTables.json";

fn load_tables(filename: &str) -> Result<CruncherTables, Box<dyn std::error::Error>> {
    // Read the JSON file
    let json_content = fs::read_to_string(filename).map_err(|err| {
        eprintln!("Error reading file '{}': {}", filename, err);
        Box::new(err)
    })?;

    // Parse CruncherTables from JSON
    let cruncher_tables: CruncherTables = serde_json::from_str(&json_content).map_err(|err| {
        eprintln!("Error parsing JSON from '{}': {}", filename, err);
        Box::new(err)
    })?;
    Ok(cruncher_tables)
}

pub fn build_corpus() -> Result<(), Box<dyn std::error::Error>> {
    let corpus_files = find_files_from_library_index(LIB_INDEX_PATH, LIB_CORPUS_INPUT_DIR)?;
    println!("Found {} files in library index.", corpus_files.len());

    let tables = load_tables(TABLES_FILE)?;
    let crunch_options = CruncherOptions::default();
    let get_inflections = |word: &str| crunch_word(word, &tables, &crunch_options);
    get_inflections("amo"); // Warm up

    let start_time = Instant::now();

    for file_path in corpus_files {
        println!("Processing file: {}", file_path);
        let work = CorpusInputWork::from_file(&file_path)?;
        println!(
            "Loaded work: {} by {} ({} rows)",
            work.work_name,
            work.author,
            work.rows.len()
        );
    }

    println!("Corpus build took {:?}", start_time.elapsed());

    Ok(())
}
