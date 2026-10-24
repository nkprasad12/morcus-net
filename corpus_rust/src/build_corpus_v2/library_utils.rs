use std::fs;

use serde::{Deserialize, Serialize};

pub(super) const LIB_CORPUS_INPUT_DIR: &str = "build-tmp/library_corpus_input";
const SKIPPED_WORK_ID: &str = "phi0959.phi002.perseus-lat2";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CorpusInputWork {
    pub(super) id: String,
    pub(super) work_name: String,
    pub(super) short_title: Option<String>,
    pub(super) author: String,
    pub(super) author_code: String,
    pub(super) rows: Vec<String>,
    pub(super) row_ids: Vec<Vec<String>>,
    pub(super) section_depth: usize,
}

impl CorpusInputWork {
    pub(super) fn from_file(file_path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let raw_content = fs::read_to_string(file_path)?;
        let work: CorpusInputWork = serde_json::from_str(&raw_content)?;
        Ok(work)
    }

    fn sort_name(&self) -> &str {
        self.short_title.as_deref().unwrap_or(&self.work_name)
    }
}

pub(super) fn load_works_from_corpus_input_dir(
    input_dir: &str,
) -> Result<Vec<CorpusInputWork>, Box<dyn std::error::Error>> {
    let mut works = vec![];
    for entry in fs::read_dir(input_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Some(path_str) = path.to_str() else {
            continue;
        };
        let work = CorpusInputWork::from_file(path_str)?;
        if work.id == SKIPPED_WORK_ID {
            continue;
        }
        works.push(work);
    }
    works.sort_by(|a, b| {
        a.author_code
            .cmp(&b.author_code)
            .then_with(|| a.sort_name().cmp(b.sort_name()))
    });
    Ok(works)
}
