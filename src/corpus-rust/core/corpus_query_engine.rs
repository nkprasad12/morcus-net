use crate::core::packed_index_utils::apply_or_to_indices;
use crate::core::query_parsing_v2::{
    QueryRelation, QueryTerm, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    parse_query,
};

use super::common::PackedIndexData;
use super::corpus_serialization::LatinCorpusIndex;
use super::packed_arrays;
use super::packed_index_utils::{
    ApplyAndResult, apply_and_to_indices, has_value_in_range, max_elements_in,
    unpack_packed_index_data,
};
use super::profiler::TimeProfiler;

use rusqlite::Connection;
use serde::Serialize;
use std::cmp::{max, min};
use std::path::Path;

const MAX_CONTEXT_LEN: usize = 100;
const DEFAULT_CONTEXT_LEN: usize = 25;

/// An error that occurs while executing a query.
#[derive(Debug, Clone)]
pub struct QueryExecError {
    pub message: String,
}

impl QueryExecError {
    fn new(message: &str) -> Self {
        QueryExecError {
            message: message.to_string(),
        }
    }
}

impl From<rusqlite::Error> for QueryExecError {
    fn from(e: rusqlite::Error) -> Self {
        QueryExecError::new(&format!("SQLite error: {}", e))
    }
}

impl From<String> for QueryExecError {
    fn from(e: String) -> Self {
        QueryExecError::new(&e)
    }
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
#[derive(Debug, Clone)]
struct SizeBounds {
    upper: usize,
    lower: usize,
}

#[derive(Debug, Clone)]
struct InternalAtom<'a> {
    inner: &'a TokenConstraintAtom,
    size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
enum InternalAtomOrConstraint<'a> {
    Atom(InternalAtom<'a>),
    Constraint(InternalConstraint<'a>),
}

#[derive(Debug, Clone)]
struct InternalConstraint<'a> {
    inner: &'a TokenConstraint,
    constraints: Vec<InternalAtomOrConstraint<'a>>,
    size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
struct InternalQueryTerm<'a> {
    relation: &'a QueryRelation,
    constraint: InternalConstraint<'a>,
}

struct IntermediateResult {
    data: PackedIndexData,
    position: i32,
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    token_db: Connection,
}

impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, rusqlite::Error> {
        let db_path = Path::new(&corpus.raw_text_db);
        let token_db = Connection::open(db_path)?;
        Ok(CorpusQueryEngine { corpus, token_db })
    }

    fn get_bounds_for_atom(&self, atom: &TokenConstraintAtom) -> SizeBounds {
        let Some(index) = self.get_index_for(atom) else {
            return SizeBounds { upper: 0, lower: 0 };
        };
        let Some(upper) = max_elements_in(index) else {
            return SizeBounds {
                upper: self.corpus.stats.total_words as usize,
                lower: 0,
            };
        };
        SizeBounds {
            upper,
            lower: upper,
        }
    }

    fn convert_atom<'a>(&self, atom: &'a TokenConstraintAtom) -> InternalAtom<'a> {
        InternalAtom {
            inner: atom,
            size_bounds: self.get_bounds_for_atom(atom),
        }
    }

    fn convert_constraint<'a>(
        &self,
        constraint: &'a TokenConstraint,
    ) -> Result<InternalConstraint<'a>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => {
                let internal_atom = self.convert_atom(atom);
                let size_bounds = internal_atom.size_bounds.clone();
                Ok(InternalConstraint {
                    inner: constraint,
                    constraints: vec![InternalAtomOrConstraint::Atom(internal_atom)],
                    size_bounds,
                })
            }
            TokenConstraint::Composed { op, children } => {
                let first = self.convert_constraint(
                    children
                        .first()
                        .ok_or(QueryExecError::new("Empty composed query"))?,
                )?;
                let mut lower = first.size_bounds.lower;
                let mut upper = first.size_bounds.upper;
                let mut constraints = vec![InternalAtomOrConstraint::Constraint(first)];
                for child in children.iter().skip(1) {
                    let converted = self.convert_constraint(child)?;
                    if *op == TokenConstraintOperation::And {
                        // These bounds are not quite tight due to the pigeonhole principle
                        // if the upper bounds are more than half the number of tokens,
                        // but we can ignore that for now.
                        lower = 0;
                        upper = min(upper, converted.size_bounds.upper);
                    } else {
                        lower = max(lower, converted.size_bounds.lower);
                        upper = max(upper, converted.size_bounds.upper);
                    }
                    constraints.push(InternalAtomOrConstraint::Constraint(converted));
                }
                Ok(InternalConstraint {
                    inner: constraint,
                    constraints,
                    size_bounds: SizeBounds { upper, lower },
                })
            }
            TokenConstraint::Negated(inner) => {
                let converted = self.convert_constraint(inner)?;
                let n = self.corpus.stats.total_words as usize;
                let upper = n - converted.size_bounds.lower;
                let lower = n - converted.size_bounds.upper;
                Ok(InternalConstraint {
                    inner,
                    constraints: vec![InternalAtomOrConstraint::Constraint(converted)],
                    size_bounds: SizeBounds { upper, lower },
                })
            }
        }
    }

    fn convert_query_term<'a>(
        &self,
        term: &'a QueryTerm,
    ) -> Result<InternalQueryTerm<'a>, QueryExecError> {
        let constraint = self.convert_constraint(&term.constraint)?;
        Ok(InternalQueryTerm {
            relation: &term.relation,
            constraint,
        })
    }

    fn compute_index_for(
        &self,
        constraint: &TokenConstraint,
    ) -> Result<Option<PackedIndexData>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => Ok(self.get_index_for(atom).cloned()),
            TokenConstraint::Composed { children, op } => {
                let first = children
                    .first()
                    .ok_or(QueryExecError::new("Empty composed query"))?;
                let mut data = match self.compute_index_for(first)? {
                    Some(data) => data,
                    None => return Ok(None),
                };
                for child in children.iter().skip(1) {
                    let child_data = match self.compute_index_for(child)? {
                        Some(data) => data,
                        None => return Ok(None),
                    };
                    let combined = match op {
                        TokenConstraintOperation::And => {
                            apply_and_to_indices(&data, 0, &child_data, 0)
                        }
                        TokenConstraintOperation::Or => {
                            apply_or_to_indices(&data, 0, &child_data, 0)
                        }
                    };
                    data = to_packed_index_data(combined?.0)?;
                }
                Ok(Some(data))
            }
            TokenConstraint::Negated(_) => {
                Err(QueryExecError::new("Negated constraints are not supported"))
            }
        }
    }

    fn compute_query_result(
        &self,
        query: &Vec<InternalQueryTerm>,
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IntermediateResult>, QueryExecError> {
        let mut indexed_terms: Vec<(usize, &InternalQueryTerm)> =
            query.iter().enumerate().collect();
        indexed_terms.sort_by_key(|(_, term)| term.constraint.size_bounds.upper);

        let (first_original_index, first_term) = indexed_terms
            .first()
            .ok_or(QueryExecError::new("Empty query"))?;
        let mut data = match self.compute_index_for(first_term.constraint.inner)? {
            Some(data) => data,
            _ => return Ok(None),
        };
        profiler.phase("Initial candidates");
        let mut position = *first_original_index as i32;

        for (original_index, term) in indexed_terms.iter().skip(1) {
            let term_data = match self.compute_index_for(term.constraint.inner)? {
                Some(data) => data,
                _ => return Ok(None),
            };
            let result = match term.relation {
                QueryRelation::After | QueryRelation::First => {
                    apply_and_to_indices(&data, position, &term_data, *original_index as i32)
                }
                _ => return Err(QueryExecError::new("Unsupported query relation")),
            }?;
            data = to_packed_index_data(result.0)?;
            profiler.phase(format!("Filter from {}", original_index).as_str());
            position = result.1;
        }
        Ok(Some(IntermediateResult { data, position }))
    }

    fn get_index_for(&self, part: &TokenConstraintAtom) -> Option<&PackedIndexData> {
        match part {
            TokenConstraintAtom::Word(word) => {
                self.corpus.indices.get("word")?.get(&word.to_lowercase())
            }
            TokenConstraintAtom::Lemma(lemma) => self.corpus.indices.get("lemma")?.get(lemma),
            &TokenConstraintAtom::Inflection(inflection) => self
                .corpus
                .indices
                .get(inflection.get_label())?
                .get(&inflection.get_code()),
        }
    }

    fn resolve_candidates(
        &self,
        candidates: &IntermediateResult,
        query_length: usize,
        profiler: &mut TimeProfiler,
    ) -> Result<Vec<u32>, QueryExecError> {
        let hard_breaks = match self
            .corpus
            .indices
            .get("breaks")
            .and_then(|m| m.get("hard"))
        {
            Some(b) => b,
            _none => return Err(QueryExecError::new("No hard breaks index found")),
        };

        let unpacked = unpack_packed_index_data(&candidates.data)?;
        profiler.phase("Unpack Candidates");
        // There can be no hard breaks between tokens without multiple tokens.
        if query_length < 2 {
            return Ok(unpacked);
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
        Ok(matches)
    }

    fn resolve_result(
        &self,
        token_id: u32,
        query_length: usize,
        context_len: usize,
    ) -> Result<CorpusQueryMatch<'_>, QueryExecError> {
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
            .map_err(|_| {
                QueryExecError::new(&format!("TokenId {} not found in any work.", token_id))
            })?;

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
            .map_err(|_| {
                QueryExecError::new(&format!(
                    "TokenId {} not found in any row for work index {}.",
                    token_id, work_idx
                ))
            })?;

        let (work_id, row_ids, work_data) = &self.corpus.work_lookup[work_idx];
        let row_idx = row_info.0 as usize;

        let start_rowid = token_id.saturating_sub(context_len as u32);
        let limit = query_length + (context_len * 2);
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
            work_id,
            work_name: &work_data.name,
            author: &work_data.author,
            section: row_ids[row_idx].join("."),
            offset: token_id - row_info.1,
            text,
            left_context,
            right_context,
        })
    }

    pub fn query_corpus(
        &self,
        query_str: &str,
        page_start: usize,
        page_size: Option<usize>,
        context_len: Option<usize>,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let mut profiler = TimeProfiler::new();
        let query = parse_query(query_str).map_err(|e| QueryExecError::new(&e.message))?;
        let num_terms = query.terms.len();
        let terms = query
            .terms
            .iter()
            .map(|term| self.convert_query_term(term))
            .collect::<Result<Vec<_>, _>>()?;
        profiler.phase("Parse query");
        let result = match self.compute_query_result(&terms, &mut profiler)? {
            Some(res) => res,
            None => return Ok(empty_result()),
        };

        let match_ids = self.resolve_candidates(&result, num_terms, &mut profiler)?;
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
                .map(|&id| self.resolve_result(id, num_terms, context_len))
                .collect::<Result<Vec<_>, _>>()?
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
