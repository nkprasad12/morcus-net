use serde::{Deserialize, Serialize};
use std::cmp::Ordering::{Equal, Greater, Less};
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

// (ID, start, end)
#[derive(Debug, Deserialize)]
pub struct WorkRowInfo(pub String, pub u32, pub u32);

#[derive(Debug, Deserialize)]
#[serde(from = "(String, Vec<WorkRowInfo>, WorkData)")]
pub struct WorkLookupEntry {
    pub work_id: String,
    pub rows: Vec<WorkRowInfo>,
    pub info: WorkData,
}

// Implementation to convert from tuple format (as in JSON) to a struct.
impl From<(String, Vec<WorkRowInfo>, WorkData)> for WorkLookupEntry {
    fn from(tuple: (String, Vec<WorkRowInfo>, WorkData)) -> Self {
        WorkLookupEntry {
            work_id: tuple.0,
            rows: tuple.1,
            info: tuple.2,
        }
    }
}

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
        leaders: Vec<(u32, usize)>,
    ) -> Result<CorpusQueryMatchMetadata<'_>, String> {
        let first_id = leaders.first().ok_or("No leaders provided")?;
        let work_idx = self
            .work_lookup
            .binary_search_by(|work_data| {
                let range = &work_data.rows;
                let work_start_token_id = range[0].1;
                let work_end_token_id = range[range.len() - 1].2;
                if first_id.0 < work_start_token_id {
                    Greater
                } else if first_id.0 >= work_end_token_id {
                    Less
                } else {
                    Equal
                }
            })
            .map_err(|_| format!("TokenId {} not found in any work.", first_id.0))?;

        let work_data = &self.work_lookup[work_idx];
        let row_data = &work_data.rows;
        let work_start_token = row_data.first().ok_or("Missing first section!")?.1;
        let work_end_token = row_data.last().ok_or("Missing last section!")?.2;

        let leader_info = leaders
            .iter()
            .map(|(token_id, length)| {
                // Find out which row the start token is in.
                let row_idx = row_data
                    .binary_search_by(|WorkRowInfo(_, start, end)| {
                        if token_id < start {
                            Greater
                        } else if token_id >= end {
                            Less
                        } else {
                            Equal
                        }
                    })
                    .map_err(|_| format!("TokenId {token_id} not found in {work_idx}."))?;

                let mut i = row_idx;
                let mut start = *token_id;
                let mut remaining = *length as u32;

                let mut chunks = vec![];
                // The leader of a single span can cover multiple rows, e.g.
                // the last word in one line of a poem and the first word
                // in the next line.
                while remaining > 0 && i < row_data.len() {
                    let WorkRowInfo(row_id, row_start, row_end) = &row_data[i];
                    let take_end = std::cmp::min(*row_end, start + remaining);
                    let take_len = take_end - start;
                    chunks.push((row_id, start - row_start, take_len));

                    remaining -= take_len;
                    start = *row_end;
                    i += 1;
                }
                Ok(chunks)
            })
            .collect::<Result<Vec<_>, String>>()?;

        Ok(CorpusQueryMatchMetadata {
            work_id: &work_data.work_id,
            work_name: &work_data.info.name,
            author: &work_data.info.author,
            leaders: leader_info.into_iter().flatten().collect(),
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
