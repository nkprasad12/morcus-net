use serde::Deserialize;
use std::collections::HashMap;
use std::error::Error;
use std::fs;

#[derive(Debug, Deserialize)]
pub struct CorpusStats {
    #[serde(rename = "totalWords")]
    pub total_words: u32,
    #[serde(rename = "totalWorks")]
    pub total_works: u32,
    #[serde(rename = "uniqueWords")]
    pub unique_words: u32,
    #[serde(rename = "uniqueLemmata")]
    pub unique_lemmata: u32,
}

#[derive(Debug, Deserialize)]
pub struct WorkData {
    pub author: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum StoredMapValue {
    Packed {
        offset: u32,
        len: u32,
    },
    BitMask {
        offset: u32,
        #[serde(rename = "numSet")]
        num_set: u32,
    },
}

pub type WorkLookupEntry = (String, Vec<(String, u32, u32)>, WorkData);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatinCorpusIndex {
    pub work_lookup: Vec<WorkLookupEntry>,
    pub stats: CorpusStats,
    pub raw_text_path: String,
    pub raw_buffer_path: String,
    pub token_starts_path: String,
    pub indices: HashMap<String, HashMap<String, StoredMapValue>>,
    pub num_tokens: u32,
}

fn file_read_err<T: Error>(e: T, path: &str, label: &str) -> String {
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".to_string());
    format!("Failed to read {label} file {path} (in {cwd}) due to: {e}")
}

pub fn deserialize_corpus(path: &str) -> Result<LatinCorpusIndex, Box<dyn Error>> {
    let json_string = fs::read_to_string(path).map_err(|e| file_read_err(e, path, "corpus"))?;
    Ok(serde_json::from_str(&json_string)?)
}
