use serde::Deserialize;
use std::collections::HashMap;
use std::error::Error;
use std::fs;
use std::path::Path;

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

pub type WorkLookupEntry = (String, Vec<Vec<String>>, WorkData);
pub type WorkRowRange = (u32, Vec<(u32, u32, u32)>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatinCorpusIndex {
    pub work_lookup: Vec<WorkLookupEntry>,
    pub work_row_ranges: Vec<WorkRowRange>,
    pub stats: CorpusStats,
    pub raw_text_path: String,
    pub raw_buffer_path: String,
    pub token_starts_path: String,
    pub indices: HashMap<String, HashMap<String, StoredMapValue>>,
    pub num_tokens: u32,
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

pub fn deserialize_corpus<P: AsRef<Path>>(path: P) -> Result<LatinCorpusIndex, Box<dyn Error>> {
    let json_string = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&json_string)?)
}
