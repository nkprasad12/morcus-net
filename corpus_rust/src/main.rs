use std::env;
use std::time::Instant;

use corpus::{
    api::{CorpusQueryResult, PageData, QueryExecError, QueryOptions},
    build_corpus_v2::build_corpus,
    corpus_index,
    corpus_query_engine::{self, CorpusQueryEngine},
};

const ARG_QUIET: &str = "--quiet";
const ARG_NO_STATS: &str = "--no-stats";
const ARG_STRICT: &str = "--strict";
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
    page_data: &PageData,
) -> Result<CorpusQueryResult<'a>, QueryExecError> {
    let options = QueryOptions {
        page_size: get_limit_arg(),
        context_len: get_context_arg(),
        strict_mode: has_arg(ARG_STRICT),
    };
    let start = Instant::now();
    let results = engine.query_corpus(query, page_data, &options)?;
    let duration = start.elapsed();
    if !has_arg(ARG_NO_STATS) {
        println!("Query executed in {duration:.2?}");
        if !results.timing.is_empty() {
            println!("Query timing breakdown:");
            for (k, v) in &results.timing {
                println!("  {}: {:.3} ms", k, *v);
            }
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

fn get_arg_or_default<T: std::str::FromStr>(name: &str, fallback: T) -> T {
    let args: Vec<String> = env::args().collect();
    if let Some(pos) = args.iter().position(|a| *a == format!("--{name}"))
        && let Some(ctx) = args.get(pos + 1)
    {
        return ctx.parse::<T>().ok().unwrap_or(fallback);
    }
    fallback
}

fn get_context_arg() -> usize {
    get_arg_or_default("context", 15)
}

fn get_limit_arg() -> usize {
    get_arg_or_default("limit", 25)
}

fn get_pages_arg() -> usize {
    get_arg_or_default("pages", 1)
}

fn get_results<'a>(
    engine: &'a CorpusQueryEngine,
    query_str: &str,
    page_data: &PageData,
) -> CorpusQueryResult<'a> {
    let result = query_with_timing(engine, query_str, page_data);
    if result.is_err() {
        eprintln!(
            "Error executing query: {}",
            result.as_ref().err().unwrap().message
        );
        std::process::exit(1);
    }
    result.unwrap()
}

fn print_query_results(
    engine: &CorpusQueryEngine,
    query_str: &str,
    page_data: &PageData,
) -> Option<PageData> {
    let results = get_results(engine, query_str, page_data);
    println!(
        "\n\x1b[4mShowing results {}-{} of about {} matches:\x1b[0m",
        page_data.result_index + 1,
        page_data.result_index as usize + results.matches.len(),
        results.result_stats.estimated_results
    );
    if has_arg(ARG_QUIET) {
        println!("- Omitted matches due to --quiet flag.\n");
        return results.next_page;
    }
    for match_data in results.matches {
        let m = &match_data.metadata;
        println!(
            "  \x1b[34m{}\x1b[0m - \x1b[32m{} {}\x1b[0m",
            m.author, m.work_name, m.leaders[0].0
        );
        let mut chunks = vec!["    ".to_string()];
        for (text, is_core) in &match_data.text {
            let color = if *is_core { "[31m" } else { "[90m" };
            // indent lines after any newline so subsequent lines align correctly
            let text = text.replace("\n", "\n    ");
            chunks.push(format!("\x1b{color}{text}\x1b[0m"));
        }
        chunks.push("\n".to_string());
        print!("{}", chunks.join(""));
    }
    results.next_page
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
                .map(|l| format!("    {l}")) // indent remaining lines
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
            eprintln!("Failed to run top: {e}");
        }
    }
}

fn print_mem_summary(tag: String, delay_secs: u64) {
    eprintln!("--- Memory summary ({tag}) ---");
    print_top_snapshot_for(std::process::id(), true);
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
}

fn build_if_needed() -> Result<(), Box<dyn std::error::Error>> {
    if !has_arg("--build") {
        return Ok(());
    }
    build_corpus()
}

fn main() {
    build_if_needed().expect("Failed to build corpus");
    let corpus = load_corpus_with_timing(CORPUS_ROOT);
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    if has_arg("--mem") {
        print_mem_summary("Before query execution".to_string(), 1);
    }
    let query_str = get_query_arg_or_exit();
    let mut page_data = PageData::default();
    for _ in 0..get_pages_arg() {
        page_data = print_query_results(&engine, &query_str, &page_data).unwrap_or_default();
    }
    if has_arg("--mem") {
        print_mem_summary("After query execution".to_string(), 1);
    }
}

/*
Run with:
cargo run --package corpus --release cli --query "@lemma:do oscula @case:dat" --limit 7
*/
