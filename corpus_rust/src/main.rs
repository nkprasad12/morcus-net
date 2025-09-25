use std::env;
use std::time::Instant;

use corpus::{
    api::{CorpusQueryResult, QueryExecError},
    corpus_query_engine::{self, CorpusQueryEngine},
    corpus_index,
};

const ARG_QUIET: &str = "--quiet";
const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

fn load_corpus_with_timing(path: &str) -> corpus_index::LatinCorpusIndex {
    let start = Instant::now();
    let corpus = corpus_index::deserialize_corpus(path).expect("Failed to load corpus");
    let duration = start.elapsed();
    println!("Corpus loaded in {duration:.2?}");
    if !has_arg(ARG_QUIET) {
        println!(
            "- Tokens: {}, Words: {}, Lemmata: {}, Works: {}",
            corpus.stats.total_words,
            corpus.stats.unique_words,
            corpus.stats.unique_lemmata,
            corpus.stats.total_works
        );
    }
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
    println!("Query executed in {duration:.2?}");
    if !results.timing.is_empty() {
        println!("Query timing breakdown:");
        for (k, v) in &results.timing {
            println!("  {}: {:.3} ms", k, *v);
        }
    }
    Ok(results)
}

fn has_arg(tag: &str) -> bool {
    let args: Vec<String> = env::args().collect();
    args.contains(&tag.to_string())
}

fn get_query_arg_or_exit() -> String {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--query")
        && let Some(q) = args.get(pos + 1)
    {
        return q.clone();
    }
    eprintln!(
        "Usage: {} --query <QUERY> [--limit <N>] [--context <N>] [--quiet]",
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
        "\n\x1b[4mShowing results {}-{} of {} matches:\x1b[0m",
        results.page_start + 1,
        results.page_start + results.matches.len(),
        results.total_results
    );
    if has_arg(ARG_QUIET) {
        println!("- Omitted matches due to --quiet flag.\n");
        return;
    }
    for match_data in results.matches {
        let m = &match_data.metadata;
        println!(
            "  \x1b[34m{}\x1b[0m - \x1b[32m{} {}\x1b[0m",
            m.author, m.work_name, m.section
        );
        let mut chunks = vec!["    ".to_string()];
        for (text, is_core) in &match_data.text {
            let color = if *is_core { "[31m" } else { "[90m" };
            chunks.push(format!("\x1b{}{}\x1b[0m", color, text));
        }
        chunks.push("\n".to_string());
        print!("{}", chunks.join(""));
    }
}

fn print_top_snapshot_for(pid: u32, show_header: bool) {
    let pid_arg = pid.to_string();
    let output = std::process::Command::new("top")
        .args(["-e", "m", "-b", "-n", "1", "-p", &pid_arg])
        .output()
        .map(|mut o| {
            let s = String::from_utf8_lossy(&o.stdout);
            let processed = s
                .lines()
                .skip(if show_header { 6 } else { 7 }) // remove first 6 header lines
                .map(|l| format!("    {}", l)) // indent remaining lines
                .collect::<Vec<_>>()
                .join("\n");
            o.stdout = processed.into_bytes();
            o
        });
    match output {
        Ok(o) => {
            if !o.stdout.is_empty() {
                eprintln!("{}", String::from_utf8_lossy(&o.stdout));
            }
            if !o.stderr.is_empty() {
                eprintln!("top stderr: {}", String::from_utf8_lossy(&o.stderr));
            }
        }
        Err(e) => {
            eprintln!("Failed to run top: {}", e);
        }
    }
}

fn print_mem_summary(tag: String, delay_secs: u64) {
    eprintln!("--- Memory summary ({}) ---", tag);
    print_top_snapshot_for(std::process::id(), true);
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
}

fn main() {
    let corpus = load_corpus_with_timing(CORPUS_ROOT);
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    if has_arg("--mem") {
        print_mem_summary("Before query execution".to_string(), 1);
    }
    let query_str = get_query_arg_or_exit();
    print_query_results(&engine, &query_str);
    if has_arg("--mem") {
        print_mem_summary("After query execution".to_string(), 1);
    }
}

/*
Run with:
cargo run --package corpus --release cli --query "@lemma:do oscula @case:dat" --limit 7
*/
