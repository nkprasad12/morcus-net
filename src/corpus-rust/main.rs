mod core;

use std::env;
use std::time::Instant;

use crate::core::{
    corpus_query_engine::{self, CorpusQueryEngine, CorpusQueryResult, QueryExecError},
    corpus_serialization,
};

const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

fn load_corpus_with_timing(path: &str) -> corpus_serialization::LatinCorpusIndex {
    let start = Instant::now();
    let corpus = corpus_serialization::deserialize_corpus(path).expect("Failed to load corpus");
    let duration = start.elapsed();
    println!("Corpus loaded in {:.2?}", duration);
    corpus
}

fn query_with_timing<'a>(
    engine: &'a CorpusQueryEngine,
    query: &str,
) -> Result<CorpusQueryResult<'a>, QueryExecError> {
    let page_start = 0;
    let page_size = Some(get_limit_arg_or_default());
    let context_len = get_context_arg_or_default();
    let start = Instant::now();
    let results = engine.query_corpus(query, page_start, page_size, context_len)?;
    let duration = start.elapsed();
    println!("Query executed in {:.2?}", duration);
    if !results.timing.is_empty() {
        println!("Query timing breakdown:");
        for (k, v) in &results.timing {
            println!("  {}: {:.3} ms", k, *v);
        }
    }
    Ok(results)
}

fn get_quiet_arg() -> bool {
    let args: Vec<String> = env::args().collect();
    args.contains(&"--quiet".to_string())
}

fn get_high_mem_arg() -> bool {
    let args: Vec<String> = env::args().collect();
    args.contains(&"--high-mem".to_string())
}

fn get_query_arg_or_exit() -> String {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--query")
        && let Some(q) = args.get(pos + 1)
    {
        return q.clone();
    }
    eprintln!(
        "Usage: {} --query <QUERY> [--limit <N>] [--context <N>] [--high-mem] [--quiet]",
        args.first().unwrap_or(&"program".to_string())
    );
    std::process::exit(1);
}

fn get_context_arg_or_default() -> Option<usize> {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--context")
        && let Some(ctx) = args.get(pos + 1)
    {
        return ctx.parse::<usize>().ok();
    }
    None
}

fn get_limit_arg_or_default() -> usize {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--limit")
        && let Some(lim) = args.get(pos + 1)
    {
        return lim.parse::<usize>().unwrap_or(25);
    }
    25
}

fn get_results<'a>(engine: &'a CorpusQueryEngine, query_str: &str) -> CorpusQueryResult<'a> {
    let result = query_with_timing(engine, query_str);
    if result.is_err() {
        eprintln!(
            "Error executing query: {}",
            result.as_ref().err().unwrap().message
        );
        std::process::exit(1);
    }
    result.unwrap()
}

fn print_query_results(engine: &CorpusQueryEngine, query_str: &str) {
    let results = get_results(engine, query_str);
    println!(
        "\nShowing results {}-{} of {} matches:",
        results.page_start + 1,
        results.page_start + results.matches.len(),
        results.total_results
    );
    if get_quiet_arg() {
        println!("- Omitted matches due to --quiet flag.\n");
        return;
    }
    for m in results.matches {
        println!("  {} - {} {}", m.author, m.work_name, m.section);
        println!("    {}*{}*{}", m.left_context, m.text, m.right_context,);
        println!();
    }
}

fn main() {
    let corpus = load_corpus_with_timing(CORPUS_ROOT);
    let engine = corpus_query_engine::CorpusQueryEngine::new(corpus, get_high_mem_arg())
        .expect("Failed to create query engine");
    let query_str = get_query_arg_or_exit();
    print_query_results(&engine, &query_str);
}

/*
Run with:
cargo run --release cli --query "@lemma:do oscula @case:dat" --limit 7
*/
