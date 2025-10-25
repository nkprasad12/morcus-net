// mod corpus_serialization;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process;
use std::time::Instant;

use morceus::crunch::crunch_word;
use morceus::indices::{CrunchResult, CruncherOptions, CruncherTables};
use morceus::inflection_data::{
    extract_case_bits, extract_gender_bits, extract_mood, extract_number, extract_tense,
    extract_voice, iterate_cases, iterate_genders,
};
use serde::{Deserialize, Serialize};

// use crate::build_corpus::corpus_serialization::write_corpus;
use crate::corpus_index::{CorpusStats, WorkData, WorkLookupEntry};

// Constants
const CORPUS_DIR: &str = "build/corpus";
const CORPUS_FILE: &str = "latin_corpus.json";
const CORPUS_RAW_TEXT: &str = "latin_corpus_raw.txt";
const CORPUS_BUFFERS: &str = "latin_corpus_buffers.bin";
const CORPUS_TOKEN_STARTS: &str = "latin_corpus_token_starts.bin";
const CORPUS_AUTHORS_LIST: &str = "latin_corpus_authors.json";

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

#[derive(Debug, Serialize, Deserialize)]
struct InProgressLatinCorpus {
    indices: CorpusIndices,
    author_lookup: HashMap<String, [usize; 2]>,
    work_lookup: Vec<WorkLookupEntry>,
    token_starts: Vec<usize>,
    token_starts_path: String,
    break_starts: Vec<usize>,
    raw_buffer_path: String,
    num_tokens: usize,
    raw_text_path: String,
    stats: CorpusStats,
}

#[derive(Debug, Serialize, Deserialize)]
struct CorpusIndices {
    word: HashMap<String, Vec<usize>>,
    lemma: HashMap<String, Vec<usize>>,
    case: HashMap<u8, Vec<usize>>,
    number: HashMap<u8, Vec<usize>>,
    gender: HashMap<u8, Vec<usize>>,
    tense: HashMap<u8, Vec<usize>>,
    person: HashMap<u8, Vec<usize>>,
    mood: HashMap<u8, Vec<usize>>,
    voice: HashMap<u8, Vec<usize>>,
    breaks: HashMap<String, Vec<usize>>,
}

impl InProgressLatinCorpus {
    fn new() -> Self {
        InProgressLatinCorpus {
            indices: CorpusIndices {
                word: HashMap::new(),
                lemma: HashMap::new(),
                case: HashMap::new(),
                number: HashMap::new(),
                gender: HashMap::new(),
                tense: HashMap::new(),
                person: HashMap::new(),
                mood: HashMap::new(),
                voice: HashMap::new(),
                breaks: HashMap::new(),
            },
            author_lookup: HashMap::new(),
            work_lookup: Vec::new(),
            token_starts: Vec::new(),
            token_starts_path: String::new(),
            break_starts: Vec::new(),
            num_tokens: 0,
            raw_text_path: String::new(),
            raw_buffer_path: String::new(),
            stats: CorpusStats {
                total_words: 0,
                total_works: 0,
                unique_words: 0,
                unique_lemmata: 0,
            },
        }
    }
}

// Helper functions
fn create_empty_corpus_index() -> InProgressLatinCorpus {
    InProgressLatinCorpus::new()
}

// Mock functions to simulate the TypeScript functions
fn clean_lemma(lemma: &str) -> String {
    lemma.to_string()
}

fn is_text_break_char(c: char) -> bool {
    " ()[];:.,?!'\n\t—\"†‘“”’<>".contains(c)
}

struct TokenIterator<'a> {
    text: &'a str,
    position: usize,
    is_in_word: bool,
}

impl<'a> TokenIterator<'a> {
    fn new(text: &'a str) -> Self {
        let is_in_word = match text.chars().next() {
            Some(c) => !is_text_break_char(c),
            None => false,
        };

        TokenIterator {
            text,
            position: 0,
            is_in_word,
        }
    }
}

impl<'a> Iterator for TokenIterator<'a> {
    type Item = (bool, String);

    fn next(&mut self) -> Option<Self::Item> {
        if self.position >= self.text.len() {
            return None;
        }

        let mut chunk_end = self.position;
        let current_is_word = self.is_in_word;

        for (idx, c) in self.text[self.position..].char_indices() {
            let char_idx = self.position + idx;
            let is_break = is_text_break_char(c);
            let state_change = (current_is_word && is_break) || (!current_is_word && !is_break);

            if state_change {
                chunk_end = char_idx;
                break;
            }

            if char_idx + c.len_utf8() == self.text.len() {
                chunk_end = self.text.len();
            }
        }

        if chunk_end == self.position && self.position < self.text.len() {
            // Handle single character token at the end
            chunk_end = self.position
                + self.text[self.position..]
                    .chars()
                    .next()
                    .unwrap()
                    .len_utf8();
        }

        let token = self.text[self.position..chunk_end].to_string();
        self.position = chunk_end;
        self.is_in_word = !current_is_word;

        Some((current_is_word, token))
    }
}

fn process_tokens(text: &'_ str) -> TokenIterator<'_> {
    TokenIterator::new(text)
}

fn normalize_token(token: &str) -> String {
    token.to_string()
}

struct ArrayMap<'a, K, V> {
    inner: &'a mut HashMap<K, Vec<V>>,
}

impl<'a, K, V> ArrayMap<'a, K, V>
where
    K: std::hash::Hash + Eq,
{
    fn new(existing: &'a mut HashMap<K, Vec<V>>) -> Self {
        ArrayMap { inner: existing }
    }

    fn insert(&mut self, key: K, value: V) {
        self.inner.entry(key).or_default().push(value);
    }
}

// Main function to absorb a work into the corpus
fn absorb_work(
    work: &CorpusInputWork,
    corpus: &mut InProgressLatinCorpus,
    get_inflections: impl Fn(&str) -> Vec<CrunchResult>,
    tokens: &mut Vec<String>,
    breaks: &mut Vec<String>,
) {
    println!(
        "Ingesting into corpus: {} ({}) - {}",
        work.work_name, work.author, work.id
    );

    let mut word_index = ArrayMap::new(&mut corpus.indices.word);
    let mut lemma_index = ArrayMap::new(&mut corpus.indices.lemma);
    let mut case_index = ArrayMap::new(&mut corpus.indices.case);
    let mut number_index = ArrayMap::new(&mut corpus.indices.number);
    let mut gender_index = ArrayMap::new(&mut corpus.indices.gender);
    let mut tense_index = ArrayMap::new(&mut corpus.indices.tense);
    let mut person_index = ArrayMap::new(&mut corpus.indices.person);
    let mut mood_index = ArrayMap::new(&mut corpus.indices.mood);
    let mut voice_index = ArrayMap::new(&mut corpus.indices.voice);
    let mut breaks_index = ArrayMap::new(&mut corpus.indices.breaks);

    let mut work_tokens = Vec::new();
    let mut work_row_lookups = vec![];

    for (row_idx, row_text) in work.rows.iter().enumerate() {
        let row_ids = &work.row_ids[row_idx];

        let break_type = if row_idx == 0 || tokens.is_empty() {
            0
        } else {
            let current_row_section_id = &work.row_ids[row_idx];
            let prev_row_section_id = &work.row_ids[row_idx - 1];

            if current_row_section_id.len() != prev_row_section_id.len() {
                // Break between e.g. 1.2 and 1.2.1
                // This generates breaks between things like headers.
                2
            } else {
                let mut is_hard_break = false;
                for i in 0..current_row_section_id.len() - 1 {
                    if current_row_section_id[i] != prev_row_section_id[i] {
                        is_hard_break = true;
                        break;
                    }
                }
                if is_hard_break { 2 } else { 1 }
            }
        };

        if break_type == 2 {
            let idx = tokens.len() - 1;
            breaks_index.insert("hard".to_string(), idx);
        }

        if break_type == 1 {
            let last = breaks.len() - 1;
            breaks[last] += "\n";
        }

        let row_start_id = tokens.len();

        for (is_word, token) in process_tokens(row_text) {
            if !is_word {
                assert_eq!(tokens.len(), breaks.len());
                if !breaks.is_empty() {
                    let last = breaks.len() - 1;
                    breaks[last] += &token;
                }
                if token.contains('.') && !tokens.is_empty() {
                    let idx = tokens.len() - 1;
                    breaks_index.insert("hard".to_string(), idx);
                }
                continue;
            }

            // TODO: UNFINISHED STUB
            let stripped = normalize_token(&token);

            word_index.insert(stripped.to_lowercase(), tokens.len());

            let mut lemmata = HashSet::new();
            let mut numbers = HashSet::new();
            let mut tenses = HashSet::new();
            let mut persons = HashSet::new();
            let mut moods = HashSet::new();
            let mut voices = HashSet::new();

            // Case and Number are already bitsets, so we can keep the
            // stored result as a bitset.
            let mut combined = 0;

            for result in get_inflections(&stripped) {
                lemmata.insert(clean_lemma(&result.lemma));
                let data = result.context.grammatical_data;

                // Handling for case and gender, which are stored as bitsets.
                combined |= data;

                let number = extract_number(data);
                if number != 0 {
                    numbers.insert(number);
                }

                let tense = extract_tense(data);
                if tense != 0 {
                    tenses.insert(tense);
                }

                let person = extract_tense(data);
                if person != 0 {
                    persons.insert(person);
                }

                let mood = extract_mood(data);
                if mood != 0 {
                    moods.insert(mood);
                }

                let voice = extract_voice(data);
                if voice != 0 {
                    voices.insert(voice);
                }
            }

            for lemma in &lemmata {
                lemma_index.insert(lemma.clone(), tokens.len());
            }

            let case_bits = extract_case_bits(combined);
            for case in iterate_cases(case_bits) {
                case_index.insert(case as u8, tokens.len());
            }

            let gender_bits = extract_gender_bits(combined);
            for gender in iterate_genders(gender_bits) {
                gender_index.insert(gender as u8, tokens.len());
            }

            for number in &numbers {
                number_index.insert(*number as u8, tokens.len());
            }

            for tense in &tenses {
                tense_index.insert(*tense as u8, tokens.len());
            }

            for person in &persons {
                person_index.insert(*person as u8, tokens.len());
            }

            for mood in &moods {
                mood_index.insert(*mood as u8, tokens.len());
            }

            for voice in &voices {
                voice_index.insert(*voice as u8, tokens.len());
            }

            work_tokens.push(stripped.clone());
            tokens.push(stripped);
            breaks.push(String::new());
        }

        work_row_lookups.push((
            row_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join("."),
            row_start_id as u32,
            tokens.len() as u32,
        ));
    }

    let metadata = WorkData {
        name: work.work_name.clone(),
        author: work.author.clone(),
    };

    corpus
        .work_lookup
        .push((work.id.clone(), work_row_lookups, metadata));
    corpus.stats.total_words += work_tokens.len() as u32;
    corpus.stats.total_works += 1;

    if !tokens.is_empty() {
        let idx = tokens.len() - 1;
        corpus
            .indices
            .breaks
            .entry("hard".to_string())
            .or_default()
            .push(idx);
    }
}

type TokenDbResult = (Vec<usize>, Vec<usize>, String);
fn save_token_db(
    tokens: &[String],
    breaks: &[String],
    corpus_dir: &str,
) -> Result<TokenDbResult, Box<dyn std::error::Error>> {
    assert_eq!(tokens.len(), breaks.len());

    let mut all = String::new();
    let mut token_starts = Vec::with_capacity(tokens.len());
    let mut break_starts = Vec::with_capacity(breaks.len());
    let mut bytes_read = 0;

    for i in 0..tokens.len() {
        token_starts.push(bytes_read);
        all.push_str(&tokens[i]);
        bytes_read += tokens[i].len();

        break_starts.push(bytes_read);
        all.push_str(&breaks[i]);
        bytes_read += breaks[i].len();
    }

    let destination = Path::new(corpus_dir).join(CORPUS_RAW_TEXT);
    fs::create_dir_all(corpus_dir)?;
    fs::write(&destination, all)?;

    Ok((
        token_starts,
        break_starts,
        destination.to_string_lossy().into_owned(),
    ))
}

fn print_artifact_summary(corpus_dir: &str) {
    let entries = match fs::read_dir(corpus_dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("Could not read corpus directory: {}", e);
            return;
        }
    };
    println!("Corpus directory contents:");
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_file() {
            continue;
        }
        let file_name = match path.file_name() {
            Some(name) => name.to_string_lossy(),
            None => continue,
        };
        if file_name.ends_with("-wal") || file_name.ends_with("-shm") {
            continue;
        }

        let content = fs::read(&path).unwrap_or_default();
        let mut hash = 0u32;
        for &byte in &content {
            hash = hash
                .wrapping_shl(5)
                .wrapping_sub(hash)
                .wrapping_add(byte as u32);
        }

        println!(
            "  - {}: {:.2} MB, hash: {:x}",
            file_name,
            metadata.len() as f64 / 1_048_576.0, // Convert to MiB
            hash
        );
    }
}

pub fn build_corpus(
    works: Vec<String>,
    tables_file: &str,
    corpus_dir: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let corpus_dir = corpus_dir.unwrap_or(CORPUS_DIR);
    let tables = load_tables(tables_file);
    let crunch_options = CruncherOptions::default();
    let get_inflections = |word: &str| crunch_word(word, &tables, &crunch_options);

    let start_time = Instant::now();

    let mut tokens: Vec<String> = Vec::new();
    let mut breaks: Vec<String> = Vec::new();
    let mut corpus = create_empty_corpus_index();
    for (i, work_path) in works.into_iter().enumerate() {
        let content = fs::read_to_string(work_path).unwrap();
        let work: CorpusInputWork = serde_json::from_str(&content).unwrap();
        absorb_work(
            &work,
            &mut corpus,
            get_inflections,
            &mut tokens,
            &mut breaks,
        );

        let author = &work.author_code;
        if let Some(author_data) = corpus.author_lookup.get_mut(author) {
            assert_eq!(
                author_data[1],
                i - 1,
                "Author works are not contiguous: {}",
                author
            );
            author_data[1] = i;
        } else {
            corpus.author_lookup.insert(author.clone(), [i, i]);
        }
    }

    corpus.num_tokens = tokens.len();
    corpus.stats.unique_words = corpus.indices.word.len() as u32;
    corpus.stats.unique_lemmata = corpus.indices.lemma.len() as u32;

    let (token_starts, break_starts, raw_text_path) = save_token_db(&tokens, &breaks, corpus_dir)?;
    corpus.token_starts = token_starts;
    corpus.break_starts = break_starts;
    corpus.raw_text_path = raw_text_path;

    // write_corpus(&mut corpus, corpus_dir)?;
    let lemma_keys_path = Path::new("corpus.rust.lemma_keys.txt");
    let mut lemma_keys_file = fs::File::create(lemma_keys_path)?;
    let mut lemma_keys: Vec<_> = corpus.indices.lemma.keys().collect();
    lemma_keys.sort();
    for key in lemma_keys {
        writeln!(lemma_keys_file, "{}", key)?;
    }
    println!("Wrote lemma keys to {}", lemma_keys_path.display());
    print_artifact_summary(corpus_dir);

    println!("Corpus stats: {:?}", corpus.stats);
    println!(
        "Corpus indexing runtime: {}ms",
        start_time.elapsed().as_millis()
    );

    Ok(())
}
