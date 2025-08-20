use super::common::PackedIndexData;
use super::corpus_serialization::LatinCorpusIndex;
use super::packed_arrays;
use super::packed_index_utils::{
    ApplyAndResult, apply_and_to_indices, has_value_in_range, max_elements_in,
    unpack_packed_index_data,
};
use super::profiler::TimeProfiler;
use super::query_parsing_v2::Query;

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

const MAX_QUERY_PARTS: usize = 8;
const MAX_QUERY_ATOMS: usize = 8;
const MAX_CONTEXT_LEN: usize = 100;
const DEFAULT_CONTEXT_LEN: usize = 25;

/// An error that occurs while executing a query.
#[derive(Debug, Clone)]
pub struct QueryExecError {
    message: String,
}

impl QueryExecError {
    fn new(message: &str) -> Self {
        QueryExecError {
            message: message.to_string(),
        }
    }
}

// Query-related structs, translated from corpus_common.ts
#[derive(Debug)]
pub enum CorpusQueryAtom {
    Word(String),
    Lemma(String),
    Inflection { category: String, value: String },
}

#[derive(Debug)]
pub struct ComposedQuery {
    pub composition: String,
    pub atoms: Vec<CorpusQueryAtom>,
}

#[derive(Debug)]
pub enum QueryToken {
    Atom(CorpusQueryAtom),
    Composed(ComposedQuery),
}

#[derive(Debug)]
pub struct CorpusQueryPart {
    pub token: QueryToken,
}

#[derive(Debug)]
pub struct CorpusQuery {
    pub parts: Vec<CorpusQueryPart>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryMatch<'a> {
    pub work_id: &'a String,
    pub work_name: &'a String,
    pub author: &'a String,
    pub section: String,
    pub offset: u32,
    pub text: String,
    pub left_context: String,
    pub right_context: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryResult<'a> {
    pub total_results: usize,
    pub matches: Vec<CorpusQueryMatch<'a>>,
    pub page_start: usize,
    pub timing: Vec<(String, f64)>,
}

// Internal types for query processing
struct InternalQueryAtom<'a> {
    atom: &'a CorpusQueryAtom,
    size_upper_bound: usize,
}

struct InternalComposedQuery<'a> {
    composition: String,
    atoms: Vec<InternalQueryAtom<'a>>,
    position: usize,
}

struct IntermediateResult {
    data: PackedIndexData,
    position: i32,
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    token_db: Connection,
}

fn validate_query_complexity(query: &CorpusQuery) -> Result<(), String> {
    if query.parts.len() > MAX_QUERY_PARTS {
        return Err(format!(
            "Query length {} exceeds maximum of {}.",
            query.parts.len(),
            MAX_QUERY_PARTS
        ));
    }
    for part in &query.parts {
        if let QueryToken::Composed(composed) = &part.token {
            if composed.atoms.len() > MAX_QUERY_ATOMS {
                return Err(format!(
                    "Query part length {} exceeds maximum of {}.",
                    composed.atoms.len(),
                    MAX_QUERY_ATOMS
                ));
            }
        }
    }
    Ok(())
}

impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, rusqlite::Error> {
        let db_path = Path::new(&corpus.raw_text_db);
        let token_db = Connection::open(db_path)?;
        Ok(CorpusQueryEngine { corpus, token_db })
    }

    fn get_all_matches_for(&self, part: &CorpusQueryAtom) -> Option<&PackedIndexData> {
        match part {
            CorpusQueryAtom::Word(word) => {
                self.corpus.indices.get("word")?.get(&word.to_lowercase())
            }
            CorpusQueryAtom::Lemma(lemma) => self.corpus.indices.get("lemma")?.get(lemma),
            CorpusQueryAtom::Inflection { category, value } => {
                self.corpus.indices.get(category)?.get(value)
            }
        }
    }

    fn get_upper_size_bound_for_atom(&self, atom: &CorpusQueryAtom) -> usize {
        self.get_all_matches_for(atom)
            .map_or(0, |data| max_elements_in(data))
    }

    fn convert_query<'a>(&self, query: &'a CorpusQuery) -> Vec<InternalComposedQuery<'a>> {
        query
            .parts
            .iter()
            .enumerate()
            .flat_map(|(i, part)| -> Vec<InternalComposedQuery> {
                match &part.token {
                    QueryToken::Atom(atom) => {
                        let size_upper_bound = self.get_upper_size_bound_for_atom(atom);
                        vec![InternalComposedQuery {
                            composition: "and".to_string(),
                            atoms: vec![InternalQueryAtom {
                                atom: &atom,
                                size_upper_bound,
                            }],
                            position: i,
                        }]
                    }
                    QueryToken::Composed(composed_query) => {
                        if composed_query.composition != "and" && composed_query.composition != "or"
                        {
                            panic!("Unsupported composition: {}", composed_query.composition);
                        }
                        composed_query
                            .atoms
                            .iter()
                            .map(|atom| {
                                let size_upper_bound = self.get_upper_size_bound_for_atom(atom);
                                InternalComposedQuery {
                                    composition: composed_query.composition.clone(),
                                    atoms: vec![InternalQueryAtom {
                                        atom: &atom,
                                        size_upper_bound,
                                    }],
                                    position: i,
                                }
                            })
                            .collect()
                    }
                }
            })
            .collect()
    }

    fn execute_initial_part(&self, part: &InternalComposedQuery) -> Option<IntermediateResult> {
        let atom_data = self.get_all_matches_for(&part.atoms[0].atom)?;
        Some(IntermediateResult {
            data: PackedIndexData::clone(atom_data),
            position: part.position as i32,
        })
    }

    fn filter_candidates_on(
        &self,
        candidates: IntermediateResult,
        query_atom: &CorpusQueryAtom,
        query_part_position: usize,
    ) -> Result<Option<IntermediateResult>, QueryExecError> {
        let filter_data = self.get_all_matches_for(query_atom);
        if filter_data.is_none() {
            return Ok(None);
        }
        let (intersection, position) = apply_and_to_indices(
            &candidates.data,
            candidates.position,
            filter_data.unwrap(),
            query_part_position as i32,
        );

        let packed = to_packed_index_data(intersection)?;

        Ok(Some(IntermediateResult {
            data: packed,
            position,
        }))
    }

    fn resolve_candidates(
        &self,
        candidates: &IntermediateResult,
        query_length: usize,
        profiler: &mut TimeProfiler,
    ) -> Vec<u32> {
        let hard_breaks = match self
            .corpus
            .indices
            .get("breaks")
            .and_then(|m| m.get("hard"))
        {
            Some(b) => b,
            _none => return vec![], // No hard breaks index found
        };

        let unpacked = unpack_packed_index_data(&candidates.data);
        profiler.phase("Unpack Candidates");
        // There can be no hard breaks between tokens without multiple tokens.
        if query_length < 2 {
            return unpacked;
        }
        let mut matches: Vec<u32> = Vec::new();

        for &token_id in &unpacked {
            let true_id = (token_id as i64) - (candidates.position as i64);
            if true_id < 0 || true_id as u64 >= self.corpus.stats.total_words {
                continue;
            }

            if query_length > 1 {
                let range_end = true_id as u32 + query_length as u32 - 2;
                if has_value_in_range(hard_breaks, (true_id as u32, range_end)) {
                    continue;
                }
            }
            matches.push(true_id as u32);
        }
        matches
    }

    fn resolve_result(
        &self,
        token_id: u32,
        query_length: usize,
        context_len: usize,
    ) -> Result<CorpusQueryMatch<'_>, rusqlite::Error> {
        let work_ranges = &self.corpus.work_row_ranges;
        let work_idx = work_ranges
            .binary_search_by(|(_, row_data)| {
                let work_start_token_id = row_data[0].1;
                let work_end_token_id = row_data[row_data.len() - 1].2;
                if token_id < work_start_token_id {
                    std::cmp::Ordering::Greater
                } else if token_id >= work_end_token_id {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map(|i| work_ranges[i].0 as usize)
            .unwrap_or_else(|_| panic!("TokenId {} not found in any work.", token_id));

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
            .map(|i| row_data[i])
            .unwrap_or_else(|_| {
                panic!(
                    "TokenId {} not found in any row for work index {}.",
                    token_id, work_idx
                )
            });

        let (work_id, row_ids, work_data) = &self.corpus.work_lookup[work_idx];
        let row_idx = row_info.0 as usize;

        let start_rowid = token_id.saturating_sub(context_len as u32);
        let limit = query_length + (context_len * 2) as usize;
        let mut stmt = self
            .token_db
            .prepare("SELECT token, break, rowid FROM raw_text WHERE rowid >= ? LIMIT ?")?;

        let mut rows = stmt.query([start_rowid, limit as u32])?;

        let mut left_context = String::new();
        let mut text = String::new();
        let mut right_context = String::new();

        while let Some(row) = rows.next()? {
            let token: String = row.get(0)?;
            let break_str: String = row.get(1)?;
            let n: u32 = row.get(2)?;

            if n < token_id {
                left_context.push_str(&token);
                left_context.push_str(&break_str);
                continue;
            }
            if n < token_id + query_length as u32 {
                text.push_str(&token);
                if n < token_id + query_length as u32 - 1 {
                    text.push_str(&break_str);
                } else {
                    right_context.push_str(&break_str);
                }
                continue;
            }
            right_context.push_str(&token);
            right_context.push_str(&break_str);
        }

        Ok(CorpusQueryMatch {
            work_id: &work_id,
            work_name: &work_data.name,
            author: &work_data.author,
            section: row_ids[row_idx].join("."),
            offset: token_id - row_info.1,
            text,
            left_context,
            right_context,
        })
    }

    pub fn query_corpus_v2(&self, query: &Query) -> Result<CorpusQueryResult<'_>, String> {
        if query.terms.len() == 0 {
            return Ok(empty_result());
        }
        unimplemented!();
    }

    pub fn query_corpus(
        &self,
        query: &CorpusQuery,
        page_start: usize,
        page_size: Option<usize>,
        context_len: Option<usize>,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        if query.parts.is_empty() {
            return Ok(empty_result());
        }
        validate_query_complexity(query).expect("Query is too complex!");
        let mut profiler = TimeProfiler::new();

        let mut sorted_query = self.convert_query(query);
        sorted_query.sort_by_key(|p| p.atoms[0].size_upper_bound);

        let mut candidates = match self.execute_initial_part(&sorted_query[0]) {
            Some(c) => c,
            _none => return Ok(empty_result()),
        };
        profiler.phase("Initial");

        for (i, part) in sorted_query.iter().skip(1).enumerate() {
            if part.composition != "and" {
                panic!("Unsupported composition: {}", part.composition);
            }
            candidates =
                match self.filter_candidates_on(candidates, &part.atoms[0].atom, part.position) {
                    Ok(Some(c)) => c,
                    Ok(_none) => return Ok(empty_result()),
                    Err(e) => return Err(e),
                };
            profiler.phase(&format!("Filter {}", i + 1));
        }

        let match_ids = self.resolve_candidates(&candidates, query.parts.len(), &mut profiler);
        profiler.phase("Check Candidates");
        let total_results = match_ids.len();

        let page_size_val = page_size.unwrap_or(total_results);
        let end = (page_start + page_size_val).min(total_results);

        let context_len = context_len
            .unwrap_or(DEFAULT_CONTEXT_LEN)
            .clamp(1, MAX_CONTEXT_LEN);
        let matches = if page_start < total_results {
            match_ids[page_start..end]
                .iter()
                .map(|&id| self.resolve_result(id, query.parts.len(), context_len))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| QueryExecError::new(&e.to_string()))?
        } else {
            vec![]
        };
        profiler.phase("Build Matches");

        Ok(CorpusQueryResult {
            total_results,
            matches,
            page_start,
            timing: profiler.get_stats().to_vec(),
        })
    }
}

fn empty_result() -> CorpusQueryResult<'static> {
    CorpusQueryResult {
        total_results: 0,
        matches: vec![],
        page_start: 0,
        timing: vec![],
    }
}

// Helper to convert ApplyAndResult to PackedIndexData
fn to_packed_index_data(result: ApplyAndResult) -> Result<PackedIndexData, QueryExecError> {
    match result {
        ApplyAndResult::Array(arr) => {
            let packed =
                packed_arrays::pack_sorted_nats(&arr).map_err(|e| QueryExecError::new(&e))?;
            Ok(PackedIndexData::PackedNumbers(packed))
        }
        ApplyAndResult::Bitmask(bm) => Ok(PackedIndexData::PackedBitMask(bm)),
    }
}
