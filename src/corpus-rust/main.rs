use std::env;
use std::time::Instant;

mod bitmask_utils;
mod common;
mod corpus_query_engine;
mod corpus_serialization;
mod packed_arrays;
mod packed_index_utils;
mod profiler;
mod query_parsing;

const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

fn load_corpus_with_timing(path: &str) -> corpus_serialization::LatinCorpusIndex {
    let start = Instant::now();
    let corpus = corpus_serialization::deserialize_corpus(path).expect("Failed to load corpus");
    let duration = start.elapsed();
    println!("Corpus loaded in {:.2?}", duration);
    corpus
}

fn query_with_timing<'a>(
    engine: &'a corpus_query_engine::CorpusQueryEngine,
    query: &corpus_query_engine::CorpusQuery,
) -> corpus_query_engine::CorpusQueryResult<'a> {
    let page_start = 0;
    let page_size = Some(get_limit_arg_or_default());
    let context_len = get_context_arg_or_default();
    let start = Instant::now();
    let results = engine
        .query_corpus(query, page_start, page_size, context_len)
        .expect("Query failed");
    let duration = start.elapsed();
    println!("Query executed in {:.2?}", duration);
    if results.timing.len() > 0 {
        println!("Query timing breakdown:");
        for (k, v) in &results.timing {
            println!("  {}: {:.2} ms", k, *v);
        }
    }
    results
}

fn get_quiet_arg() -> bool {
    let args: Vec<String> = env::args().collect();
    args.contains(&"--quiet".to_string())
}

fn get_query_arg_or_exit() -> String {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--query") {
        if let Some(q) = args.get(pos + 1) {
            return q.clone();
        }
    }
    eprintln!(
        "Usage: {} --query <QUERY> [--limit <N>] [--context <N>] [--quiet]",
        args.get(0).unwrap_or(&"program".to_string())
    );
    std::process::exit(1);
}

fn get_context_arg_or_default() -> Option<usize> {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--context") {
        if let Some(ctx) = args.get(pos + 1) {
            return ctx.parse::<usize>().ok();
        }
    }
    None
}

fn get_limit_arg_or_default() -> usize {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--limit") {
        if let Some(lim) = args.get(pos + 1) {
            return lim.parse::<usize>().unwrap_or(25);
        }
    }
    25
}

fn main() {
    let corpus = load_corpus_with_timing(CORPUS_ROOT);
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    let query_str = get_query_arg_or_exit();
    let query = query_parsing::parse_query(&query_str);
    let results = query_with_timing(&engine, &query);
    println!(
        "Showing results {}-{} of {} matches:\n",
        results.page_start + 1,
        results.page_start + results.matches.len(),
        results.total_results
    );
    if get_quiet_arg() {
        println!("- Omitted matches due to --quiet flag.");
        return;
    }
    for m in results.matches {
        println!("  {} - {} {}", m.author, m.work_name, m.section);
        println!("    {}*{}*{}", m.left_context, m.text, m.right_context,);
        println!();
    }
}

/*
Run with:
cargo run --release query-engine --query "[case:3] [case:2] [case:1] [case:2]" --limit 7
*/
