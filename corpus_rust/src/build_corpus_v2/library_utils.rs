use std::{collections::HashMap, fs};

use serde::{Deserialize, Serialize};

pub(super) const LIB_INDEX_PATH: &str = "build/library_processed/morcus_library_index.json";
pub(super) const LIB_CORPUS_INPUT_DIR: &str = "build-tmp/library_corpus_input";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CorpusInputWork {
    pub(super) id: String,
    pub(super) work_name: String,
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
}

pub fn find_files_from_library_index(
    index_path: &str,
    input_dir: &str,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let hard_coded = HardCoded::new();

    let raw_content = fs::read_to_string(index_path)?;
    let library_index: LibraryIndex = serde_json::from_str(&raw_content)?;

    let work_metadata: Vec<LibraryMetadata> = library_index
        .entries
        .into_values()
        .filter(|(_, metadata)| {
            metadata.is_translation != Some(true)
                && !hard_coded.skips.contains(metadata.id.as_str())
        })
        .map(|(_, metadata)| metadata)
        .collect();
    // Vector of (author code, work name, id)
    let mut works = vec![];
    for metadata in work_metadata {
        let author_code = hard_coded.to_author_code(&metadata.author)?;
        works.push((author_code, metadata.name.clone(), metadata.id.clone()));
    }
    works.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    Ok(works
        .into_iter()
        .map(|(_, _, id)| format!("{}/{}.json", input_dir, id))
        .collect())
}

#[derive(Debug, Deserialize)]
struct LibraryMetadata {
    id: String,
    name: String,
    author: String,
    #[serde(rename = "isTranslation")]
    is_translation: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct LibraryIndex {
    #[serde(flatten)]
    entries: HashMap<String, (String, LibraryMetadata)>,
}

struct HardCoded {
    skips: std::collections::HashSet<String>,
    author_code_map: HashMap<String, String>,
}

impl HardCoded {
    fn new() -> Self {
        let mut skips = std::collections::HashSet::new();
        // This is a duplicate of Heroides, which we have the macronized edition of.
        skips.insert("phi0959.phi002.perseus-lat2".to_string());

        let mut author_code_map = HashMap::new();
        author_code_map.insert("Julius Caesar".to_string(), "Caesar".to_string());
        author_code_map.insert("P. Ovidius Naso".to_string(), "Ovid".to_string());
        author_code_map.insert("Cornelius Tacitus".to_string(), "Tacitus".to_string());
        author_code_map.insert("C. Valerius Catullus".to_string(), "Catullus".to_string());
        author_code_map.insert("M. Tullius Cicero".to_string(), "Cicero".to_string());
        author_code_map.insert("Ammianus Marcellinus".to_string(), "Ammianius".to_string());
        author_code_map.insert("Calpurnius Siculus".to_string(), "Calpurnius".to_string());
        author_code_map.insert("Cornelius Nepos".to_string(), "Nepos".to_string());
        author_code_map.insert("Minucius Felix".to_string(), "Minucius".to_string());

        HardCoded {
            skips,
            author_code_map,
        }
    }

    fn to_author_code(&self, author: &str) -> Result<String, String> {
        if author.split_whitespace().count() == 1 {
            return Ok(author.to_string());
        }
        self.author_code_map
            .get(author)
            .map(|s| s.to_string())
            .ok_or_else(|| format!("No code for author {}", author))
    }
}
