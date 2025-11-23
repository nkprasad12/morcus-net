use serde::{Deserialize, Serialize};

/// An error that occurs while executing a query.
#[derive(Debug, Clone)]
pub struct QueryExecError {
    pub message: String,
}

/// Extra details about a single query match.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryMatchMetadata<'a> {
    pub work_id: &'a String,
    pub work_name: &'a String,
    pub author: &'a String,
    pub section: &'a String,
    pub offset: u32,
}

/// A single match from a corpus query.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryMatch<'a> {
    pub metadata: CorpusQueryMatchMetadata<'a>,
    /// The text of the match and surrounding context.
    /// The boolean indicates whether the given string is part of the match
    /// (if true) or context (if false).
    pub text: Vec<(String, bool)>,
}

/// Data to resolve a page of results.
#[derive(Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageData {
    /// The index of the next result in the full list of actual results.
    /// For example, with if we had 60 results so far, and returned 10
    /// on this page, the `result_index` would be 70 (because it's 0-based).
    pub result_index: u32,
    /// The token ID of the next candidate match.
    pub result_id: u32,
    /// The index of the next candidate match within the candidate set.
    pub candidate_index: u32,
}

/// Global information about all results of a query.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryGlobalInfo {
    /// The total number of results for this query.
    pub total_results: usize,
    /// Whether the total result count is exact.
    pub exact_count: Option<bool>,
}

/// A single page of matches for a query, along with metadata.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryResult<'a> {
    pub matches: Vec<CorpusQueryMatch<'a>>,
    pub result_stats: QueryGlobalInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page: Option<PageData>,
    pub timing: Vec<(String, f64)>,
}
