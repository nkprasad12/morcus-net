mod bitmask_utils;
mod common;
mod corpus_query_engine;
mod corpus_serialization;
mod packed_arrays;
mod packed_index_utils;
mod profiler;
mod query_parsing;

use node_bindgen::derive::node_bindgen;

const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

fn create_engine(path: &str) -> corpus_query_engine::CorpusQueryEngine {
    let corpus = corpus_serialization::deserialize_corpus(path).expect("Failed to load corpus");
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    engine
}

struct QueryEngineWrapper {
    engine: corpus_query_engine::CorpusQueryEngine,
}

#[node_bindgen]
impl QueryEngineWrapper {
    #[node_bindgen(constructor)]
    fn new() -> Self {
        Self {
            engine: create_engine(CORPUS_ROOT),
        }
    }

    #[node_bindgen]
    fn query(
        &self,
        query_str: String,
        page_start: u32,
        page_size: u32,
    ) -> String {
        let query = query_parsing::parse_query(&query_str);
        let result = self.engine
            .query_corpus(&query, page_start as usize, Some(page_size as usize))
            .expect("Query failed");
        serde_json::to_string(&result.0).expect("Failed to serialize result")
    }
}
