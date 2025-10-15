mod indices;

use indices::CruncherTables;
use std::env;
use std::fs;
use std::process;

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

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <cruncher_tables.json>", args[0]);
        process::exit(1);
    }
    let filename = &args[2];
    print_mem_summary("Before execution".to_string(), 1);
    let _tables = load_tables(filename);
    print_mem_summary("After execution".to_string(), 1);
    println!("Successfully loaded CruncherTables from '{}'", filename);
}

/* Run with:
cargo run --package morceus --release cli -- <path/to/cruncher_tables.json>
*/
