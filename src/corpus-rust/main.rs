use std::time::Instant;

mod bitmask_utils;
mod common;
mod corpus_query_engine;
mod corpus_serialization;
mod packed_arrays;
mod packed_index_utils;
mod query_parsing;

const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

fn load_corpus_with_timing(path: &str) -> corpus_serialization::LatinCorpusIndex {
    let start = Instant::now();
    let corpus = corpus_serialization::deserialize_corpus(path).expect("Failed to load corpus");
    let duration = start.elapsed();
    println!("Corpus loaded in {:.2?}", duration);
    corpus
}

fn query_with_timing(
    engine: &corpus_query_engine::CorpusQueryEngine,
    query: &corpus_query_engine::CorpusQuery,
    page_start: usize,
    page_size: Option<usize>,
) -> corpus_query_engine::CorpusQueryResult {
    let start = Instant::now();
    let results = engine
        .query_corpus(query, page_start, page_size)
        .expect("Query failed");
    let duration = start.elapsed();
    println!("Query executed in {:.2?}", duration);
    results
}

fn main() {
    let corpus = load_corpus_with_timing(CORPUS_ROOT);
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    let query_str = "[lemma:do] [word:oscula] [case:3]";
    let query = query_parsing::parse_query(query_str);
    let results = query_with_timing(&engine, &query, 0, Some(100));
    println!(
        "Showing results {}-{} of {} matches:\n",
        results.page_start + 1,
        results.page_start + results.matches.len(),
        results.total_results
    );
    for m in results.matches {
        println!("  {} - {} {}", m.author, m.work_name, m.section);
        println!("    {}*{}*{}", m.left_context, m.text, m.right_context,);
        println!();
    }
}
