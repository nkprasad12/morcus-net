#![cfg_attr(
    not(test),
    deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)
)]

mod core;

use crate::core::{
    corpus_query_engine::{CorpusQueryEngine, CorpusQueryResult},
    corpus_serialization::deserialize_corpus,
};

use node_bindgen::derive::node_bindgen;

const CORPUS_FILE: &str = "latin_corpus.json";

fn create_engine(corpus_dir: String) -> Result<CorpusQueryEngine, String> {
    let corpus_path = format!("{}/{}", corpus_dir, CORPUS_FILE);
    let corpus = deserialize_corpus(corpus_path).map_err(|e| e.to_string())?;
    CorpusQueryEngine::new(corpus).map_err(|e| e.to_string())
}

struct QueryEngineWrapper {
    engine: CorpusQueryEngine,
}

fn get_results<'a>(
    engine: &'a CorpusQueryEngine,
    query: &str,
    page_start: u32,
    page_size: u32,
) -> Result<CorpusQueryResult<'a>, String> {
    engine
        .query_corpus(query, page_start as usize, Some(page_size as usize), None)
        .map_err(|e| e.message)
}

#[node_bindgen]
impl QueryEngineWrapper {
    #[node_bindgen(constructor)]
    fn new(corpus_dir: String) -> Self {
        // `node_bindgen` does not seem to support returning a `Result` from a constructor.
        // An error here will cause the Node process to crash, but it's not that bad since this
        // will only be called once.
        #[allow(clippy::expect_used)]
        let engine = create_engine(corpus_dir).expect("Failed to create query engine");
        Self { engine }
    }

    #[node_bindgen]
    fn query(&self, query_str: String, page_start: u32, page_size: u32) -> Result<String, String> {
        let result = get_results(&self.engine, &query_str, page_start, page_size)?;
        serde_json::to_string(&result).map_err(|_| "Failed to serialize result".to_string())
    }
}
