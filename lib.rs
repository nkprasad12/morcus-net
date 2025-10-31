#![cfg_attr(
    not(test),
    deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)
)]

use corpus::{corpus_index::deserialize_corpus, corpus_query_engine::CorpusQueryEngine};
use morceus::{
    crunch::crunch_word,
    indices::{CruncherOptions, CruncherTables},
};
use std::{fs, process};

use node_bindgen::derive::node_bindgen;

const CORPUS_FILE: &str = "latin_corpus.json";

fn create_engine(corpus_dir: String) -> Result<CorpusQueryEngine, String> {
    let corpus_path = &format!("{corpus_dir}/{CORPUS_FILE}");
    let corpus = deserialize_corpus(corpus_path).map_err(|e| e.to_string())?;
    CorpusQueryEngine::new(corpus).map_err(|e| e.to_string())
}

struct QueryEngineWrapper {
    engine: CorpusQueryEngine,
}

#[node_bindgen]
impl QueryEngineWrapper {
    #[node_bindgen(constructor)]
    fn new(corpus_dir: String) -> Self {
        // `node_bindgen` does not seem to support returning a `Result` from a constructor.
        // An error here will cause the Node process to crash, but it's not that bad since this
        // will only be called once.
        #[allow(clippy::expect_used)]
        let engine = create_engine(corpus_dir.clone()).expect("Failed to create query engine");
        Self { engine }
    }

    #[node_bindgen]
    fn query(
        &self,
        query_str: String,
        page_start: u32,
        page_size: u32,
        context_len: u32,
    ) -> Result<String, String> {
        let result = self
            .engine
            .query_corpus(
                &query_str,
                page_start as usize,
                page_size as usize,
                context_len as usize,
            )
            .map_err(|e| e.message)?;
        serde_json::to_string(&result).map_err(|_| "Failed to serialize result".to_string())
    }
}

fn load_tables(filename: &str) -> CruncherTables {
    // Read the JSON file
    let json_content = fs::read_to_string(filename).unwrap_or_else(|err| {
        eprintln!("Error reading file '{}': {}", filename, err);
        process::exit(1);
    });

    // Parse CruncherTables from JSON
    let cruncher_tables: CruncherTables =
        serde_json::from_str(&json_content).unwrap_or_else(|err| {
            eprintln!("Error parsing JSON from '{}': {}", filename, err);
            process::exit(1);
        });
    cruncher_tables
}

struct Cruncher {
    tables: CruncherTables,
    default_options: CruncherOptions,
}

#[node_bindgen]
impl Cruncher {
    #[node_bindgen(constructor)]
    fn new(table_path: String) -> Self {
        let default_options = CruncherOptions::default();
        Self {
            tables: load_tables(&table_path),
            default_options,
        }
    }

    #[node_bindgen]
    fn crunch(&self, word: String) -> Result<String, String> {
        let results = crunch_word(&word, &self.tables, &self.default_options);
        serde_json::to_string(&results).map_err(|_| "Failed to serialize result".to_string())
    }
}
