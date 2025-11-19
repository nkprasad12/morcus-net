use morceus::indices::CruncherTables;
use std::env;
use std::fs;
use std::process;

const TABLES_FILE: &str = "build/morceus/processed/morceusTables.json";

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

fn print_mem_summary(tag: String, delay_secs: Option<u64>) {
    eprintln!("--- Memory summary ({}) ---", tag);
    print_top_snapshot_for(std::process::id(), true);
    let delay_secs = match delay_secs {
        Some(secs) => secs,
        None => return,
    };
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
    std::thread::sleep(std::time::Duration::from_secs(delay_secs / 2));
    print_top_snapshot_for(std::process::id(), false);
}

fn load_tables(filename: &str) -> CruncherTables {
    // Read the JSON file
    let json_content = fs::read_to_string(filename).unwrap_or_else(|err| {
        eprintln!("Error reading file '{}': {}", filename, err);
        eprintln!(
            "To generate the tables, run (from the repo root):\n./morcus.sh build --morceus_tables",
        );
        process::exit(1);
    });

    // Parse CruncherTables from JSON
    let cruncher_tables: CruncherTables =
        serde_json::from_str(&json_content).unwrap_or_else(|err| {
            eprintln!("Error parsing JSON from '{}': {}", filename, err);
            process::exit(1);
        });

    if !validate_tables(&cruncher_tables) {
        process::exit(1);
    }

    cruncher_tables
}

fn validate_tables(tables: &CruncherTables) -> bool {
    let removed_chars = ['+', '^', '_', '-'];
    // Validate that all_stems is sorted
    let is_stems_sorted = tables.all_stems.windows(2).all(|w| {
        let key1 = w[0].stem.to_lowercase().replace(removed_chars, "");
        let key2 = w[1].stem.to_lowercase().replace(removed_chars, "");
        key1 <= key2
    });
    if !is_stems_sorted {
        eprintln!("all_stems is not sorted");
        return false;
    }

    // Validate that all_irregs is sorted
    let is_irregs_sorted = tables.all_irregs.windows(2).all(|w| {
        let key1 = w[0].form.to_lowercase().replace(removed_chars, "");
        let key2 = w[1].form.to_lowercase().replace(removed_chars, "");
        key1 <= key2
    });
    if !is_irregs_sorted {
        eprintln!("all_irregs is not sorted");
        return false;
    }
    true
}

macro_rules! timed {
    ($label:expr, $expr:expr) => {{
        let start = std::time::Instant::now();
        let result = $expr;
        let duration = start.elapsed();
        println!("{} in {:.2?}", $label, duration);
        result
    }};
}

#[cfg(feature = "complete")]
fn handle_complete(args: &[String], tables: &CruncherTables) -> Result<(), String> {
    use morceus::completions::{Autocompleter, AutompleterOptions};

    assert_eq!(&args[2], "complete");
    let prefix: &str = &args[3];

    // Set here for illustration on how to create options. You can also use ::default().
    let options = AutompleterOptions::builder().relax_i_j(true).build();
    let tables = std::borrow::Cow::Borrowed(tables);
    let completer = timed!("Created completer", Autocompleter::new(tables, options)?);
    let completions = timed!("Found completions", completer.completions_for(prefix)?);
    print_mem_summary("After finding completions".to_string(), None);

    let n = completions.len();
    println!("Sample completions for '{}' [{}]:", prefix, n);
    for result in completions {
        println!("- Lemma: {}", result.lemma());
        for word in result.sample_matches() {
            let stem = match &word.stem {
                None => {
                    println!("  - {} [Irreg]", word.form);
                    continue;
                }
                Some(s) => s,
            };
            println!("  - Stem: {stem}");
            println!(
                "    - {} | Inflection Code {}",
                word.form, word.context.grammatical_data
            );
        }
    }
    Ok(())
}

#[cfg(feature = "crunch")]
fn handle_crunch(args: &[String], tables: &CruncherTables) {
    assert_eq!(&args[2], "crunch");

    let options = morceus::indices::CruncherOptions::default();
    let word = &args[3];

    let results = morceus::crunch::crunch_word(word, tables, &options);
    print_mem_summary("After crunching".to_string(), None);

    if results.is_empty() {
        println!("No results found for '{}'", word);
        return;
    }
    for result in results {
        println!("{:?}", result);
    }
}

fn print_usage(args: &[String]) {
    eprintln!("Usage:");
    eprintln!("  Analyses for a given word:");
    eprintln!("    {} crunch <word>", args[0]);
    eprintln!("  Possible completions for a given prefix:");
    eprintln!("    {} complete <prefix>", args[0]);
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 4 {
        print_usage(&args);
        process::exit(1);
    }

    let start = std::time::Instant::now();
    let tables = load_tables(TABLES_FILE);
    let duration = start.elapsed();
    println!("Parsed tables in {duration:.2?}");

    let command = &args[2];
    match command.as_str() {
        #[cfg(feature = "crunch")]
        "crunch" => handle_crunch(&args, &tables),
        #[cfg(feature = "complete")]
        "complete" => handle_complete(&args, &tables).unwrap(),
        _ => {
            eprintln!("Unknown command: {}", command);
            process::exit(1);
        }
    }
}

/* Run with:
cargo run --package morceus --release cli crunch <word>
cargo run --package morceus --release --no-default-features --features complete cli complete <prefix>
*/
