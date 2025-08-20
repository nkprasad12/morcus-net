mod core;

use crate::core::{corpus_query_engine, corpus_serialization, query_parsing_v2};

use node_bindgen::derive::node_bindgen;

const CORPUS_FILE: &str = "latin_corpus.json";

fn create_engine(path: &str) -> corpus_query_engine::CorpusQueryEngine {
    let corpus = corpus_serialization::deserialize_corpus(path).expect("Failed to load corpus");
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    engine
}

struct QueryEngineWrapper {
    engine: corpus_query_engine::CorpusQueryEngine,
}

fn get_results<'a>(
    engine: &'a corpus_query_engine::CorpusQueryEngine,
    query_str: &str,
    page_start: u32,
    page_size: u32,
) -> corpus_query_engine::CorpusQueryResult<'a> {
    let query = query_parsing_v2::parse_query(&query_str).expect("");
    return engine
        .query_corpus(&query, page_start as usize, Some(page_size as usize), None)
        .expect("Query failed");
}

#[node_bindgen]
impl QueryEngineWrapper {
    #[node_bindgen(constructor)]
    fn new(corpus_dir: String) -> Self {
        let corpus_path = format!("{}/{}", corpus_dir, CORPUS_FILE);
        Self {
            engine: create_engine(&corpus_path),
        }
    }

    #[node_bindgen]
    fn query(&self, query_str: String, page_start: u32, page_size: u32) -> String {
        let result = get_results(&self.engine, &query_str, page_start, page_size);
        serde_json::to_string(&result).expect("Failed to serialize result")
    }
}
