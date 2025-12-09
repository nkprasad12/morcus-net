use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;
use std::fs;

use crate::api::CorpusQueryMatchMetadata;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusStats {
    pub total_words: u32,
    pub total_works: u32,
    pub unique_words: u32,
    pub unique_lemmata: u32,
}

#[derive(Debug, Serialize, Deserialize)]
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
    pub author_lookup: HashMap<String, (usize, usize)>,
    pub stats: CorpusStats,
    pub raw_text_path: String,
    pub raw_buffer_path: String,
    pub token_starts_path: String,
    /// The encoded inflection options for each word in the corpus.
    pub inflections_raw_buffer_path: String,
    /// The offsets for the encoded inflection options for each word in the corpus.
    pub inflections_offsets_path: String,
    pub indices: HashMap<String, Vec<StoredMapValue>>,
    pub id_table: HashMap<String, HashMap<String, u32>>,
    pub num_tokens: u32,
}

impl LatinCorpusIndex {
    /// Resolves a match token into its metadata.
    pub fn resolve_match_token(
        &self,
        token_id: u32,
    ) -> Result<CorpusQueryMatchMetadata<'_>, String> {
        let work_ranges = &self.work_lookup;
        let work_idx = work_ranges
            .binary_search_by(|row_data| {
                let range = &row_data.1;
                let work_start_token_id = range[0].1;
                let work_end_token_id = range[range.len() - 1].2;
                if token_id < work_start_token_id {
                    std::cmp::Ordering::Greater
                } else if token_id >= work_end_token_id {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map_err(|_| format!("TokenId {token_id} not found in any work."))?;

        let row_data = &work_ranges[work_idx].1;
        let row_info = row_data
            .binary_search_by(|(_, start, end)| {
                if token_id < *start {
                    std::cmp::Ordering::Greater
                } else if token_id >= *end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map(|i| &row_data[i])
            .map_err(|_| {
                format!("TokenId {token_id} not found in any row for work index {work_idx}.")
            })?;

        let (work_id, sections, work_data) = &self.work_lookup[work_idx];
        let work_start_token = sections.first().ok_or("Missing first section!")?.1;
        let work_end_token = sections.last().ok_or("Missing last section!")?.2;

        Ok(CorpusQueryMatchMetadata {
            work_id,
            work_name: &work_data.name,
            author: &work_data.author,
            section: &row_info.0,
            offset: token_id - row_info.1,
            work_start_token,
            work_end_token,
        })
    }
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
