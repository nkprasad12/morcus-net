use crate::common::PackedBitMask;
use crate::packed_arrays;
use crate::packed_index_utils::{apply_or_to_indices, smear_bitmask, unpack_packed_index_data};
use crate::query_parsing_v2::{
    QueryRelation, QueryTerm, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    parse_query,
};

use super::common::IndexData;
use super::corpus_serialization::LatinCorpusIndex;
use super::packed_index_utils::{apply_and_to_indices, max_elements_in};
use super::profiler::TimeProfiler;

use memmap2::Mmap;
use serde::Serialize;
use std::cmp::{max, min};
use std::error::Error;
use std::fs::File;

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

impl From<String> for QueryExecError {
    fn from(e: String) -> Self {
        QueryExecError::new(&e)
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryMatchMetadata<'a> {
    pub work_id: &'a String,
    pub work_name: &'a String,
    pub author: &'a String,
    pub section: String,
    pub offset: u32,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusQueryMatch<'a> {
    pub metadata: CorpusQueryMatchMetadata<'a>,
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
struct InternalAtom {
    size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
struct InternalConstraint<'a> {
    inner: &'a TokenConstraint,
    size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
struct InternalQueryTerm<'a> {
    relation: &'a QueryRelation,
    constraint: InternalConstraint<'a>,
}

struct IntermediateResult {
    data: IndexData,
    position: u32,
}

struct CorpusText {
    mmap: Mmap,
}

impl CorpusText {
    pub fn new(raw_text_path: &str) -> Result<Self, Box<dyn Error>> {
        let file = File::open(raw_text_path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        Ok(CorpusText { mmap })
    }

    pub fn slice(&self, start: usize, end: usize) -> String {
        // We store the starts of each word as byte offsets, so this should always be valid UTF-8.
        unsafe { String::from_utf8_unchecked(self.mmap[start..end].to_vec()) }
    }

    pub fn advise_range(&self, start: usize, end: usize) {
        if start >= end {
            return;
        }
        unsafe {
            let ptr = self.mmap.as_ptr().add(start) as *mut libc::c_void;
            let len = end - start;
            libc::madvise(ptr, len, libc::MADV_WILLNEED);
        }
    }
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    text: CorpusText,
}

// Methods for converting a query to an internal form.
impl CorpusQueryEngine {
    /// Get the size bounds for a token constraint atom. This should be present in the raw data.
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

    /// Converts an atom to its internal representation.
    fn convert_atom(&self, atom: &TokenConstraintAtom) -> InternalAtom {
        InternalAtom {
            size_bounds: self.get_bounds_for_atom(atom),
        }
    }

    /// Converts a constraint to its internal representation, calculating size bounds appropriately.
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
                }
                Ok(InternalConstraint {
                    inner: constraint,
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
}

// Basic methods for calculating indices corresponding to query terms.
impl CorpusQueryEngine {
    fn compute_index_for_composed(
        &self,
        children: &[TokenConstraint],
        op: &TokenConstraintOperation,
    ) -> Result<Option<IndexData>, QueryExecError> {
        // Sort the children by their upper size bounds. For `and` operations, we want the
        // smallest upper bound first so the most constrained children are considered first.
        // For `or` operations, we want the largest upper bound first so that we hopefully
        // start and stick with a bitmask.
        let mut internal_children = children
            .iter()
            .map(|c| self.convert_constraint(c))
            .collect::<Result<Vec<_>, _>>()?;
        internal_children.sort_by_key(|c| c.size_bounds.upper);
        if *op == TokenConstraintOperation::Or {
            internal_children.reverse();
        }

        let first = internal_children
            .first()
            .ok_or(QueryExecError::new("Empty composed query"))?;
        let mut data = match self.compute_index_for(first.inner)? {
            Some(data) => data,
            None => return Ok(None),
        };

        for child in internal_children.iter().skip(1) {
            let child_data = match self.compute_index_for(child.inner)? {
                Some(data) => data,
                None => return Ok(None),
            };
            let combined = match op {
                TokenConstraintOperation::And => apply_and_to_indices(&data, 0, &child_data, 0),
                TokenConstraintOperation::Or => apply_or_to_indices(&data, 0, &child_data, 0),
            };
            data = combined?.0;
        }
        Ok(Some(data))
    }

    /// Computes the candidate index for a particular token constraint.
    fn compute_index_for(
        &self,
        constraint: &TokenConstraint,
    ) -> Result<Option<IndexData>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => Ok(self.get_index_for(atom).cloned()),
            TokenConstraint::Composed { children, op } => {
                self.compute_index_for_composed(children, op)
            }
            TokenConstraint::Negated(_) => {
                Err(QueryExecError::new("Negated constraints are not supported"))
            }
        }
    }

    fn compute_query_candidates(
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
        let mut position = *first_original_index as u32;

        for (original_index, term) in indexed_terms.iter().skip(1) {
            let term_data = match self.compute_index_for(term.constraint.inner)? {
                Some(data) => data,
                _ => return Ok(None),
            };
            (data, position) = match term.relation {
                QueryRelation::After | QueryRelation::First => {
                    apply_and_to_indices(&data, position, &term_data, *original_index as u32)
                }
                _ => return Err(QueryExecError::new("Unsupported query relation")),
            }?;
            profiler.phase(format!("Filter from {original_index}").as_str());
        }
        Ok(Some(IntermediateResult { data, position }))
    }

    fn get_index_for(&self, part: &TokenConstraintAtom) -> Option<&IndexData> {
        match part {
            TokenConstraintAtom::Word(word) => self.get_index("word", &word.to_lowercase()),
            TokenConstraintAtom::Lemma(lemma) => self.get_index("lemma", lemma),
            &TokenConstraintAtom::Inflection(inflection) => {
                self.get_index(inflection.get_label(), &inflection.get_code())
            }
        }
    }

    fn get_index(&self, key: &str, value: &str) -> Option<&IndexData> {
        self.corpus.indices.get(key)?.get(value)
    }
}

// Core, high level logic for query execution.
impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, Box<dyn Error>> {
        let text = CorpusText::new(&corpus.raw_text_path)?;
        Ok(CorpusQueryEngine { corpus, text })
    }

    /// Returns the hard breaks, verifying that it is a bitmask.
    fn get_hard_breaks(&self) -> Result<&PackedBitMask, QueryExecError> {
        let index = self
            .get_index("breaks", "hard")
            .ok_or(QueryExecError::new("No hard breaks index found"))?;
        match index {
            IndexData::PackedBitMask(pbm) => Ok(pbm),
            _ => Err(QueryExecError::new("Hard breaks index is not a bitmask")),
        }
    }

    /// Computes the page of results for the given parameters.
    fn compute_page_result(
        &self,
        match_results: &IntermediateResult,
        page_start: usize,
        page_size: Option<usize>,
        profiler: &mut TimeProfiler,
    ) -> Result<(Vec<u32>, usize), QueryExecError> {
        let page_size = match page_size {
            Some(size) => size,
            // If no page size is given, return all results.
            None => {
                // Unpack all the results.
                let position = match_results.position;
                let matches = unpack_packed_index_data(&match_results.data)?;
                profiler.phase("Unpack match results");
                // Skip any illegal matches
                let mut i: usize = 0;
                while i < matches.len() && matches[i] < position {
                    i += 1;
                }

                let total_results = matches.len() - i;
                let page_size = page_size.unwrap_or(total_results);
                let end = (page_start + page_size).min(total_results) + i;

                let filtered = &matches[i..end]
                    .iter()
                    .map(|&x| x - position)
                    .collect::<Vec<_>>();
                profiler.phase("Compute page token IDs");
                return Ok((filtered.to_vec(), total_results));
            }
        };

        // Get to the start of the page.
        let mut results: Vec<u32> = vec![];
        let mut i: usize = match &match_results.data {
            IndexData::Unpacked(_) | IndexData::PackedNumbers(_) => page_start,
            IndexData::PackedBitMask(bitmask) => {
                let mut start_idx = 0;
                for _ in 0..page_start {
                    start_idx = bitmask
                        .next_one_bit(start_idx)
                        .ok_or(QueryExecError::new("Not enough results for page"))?
                        + 1;
                }
                start_idx
            }
        };

        let n = match_results.data.num_elements();
        while results.len() < page_size {
            let token_id = match match_results.data {
                IndexData::Unpacked(ref data) => {
                    if i >= n {
                        break;
                    }
                    let id = data[i];
                    i += 1;
                    id
                }
                IndexData::PackedNumbers(ref data) => {
                    if i >= n {
                        break;
                    }
                    let id = packed_arrays::get(data, i);
                    i += 1;
                    id
                }

                IndexData::PackedBitMask(ref bitmask_data) => {
                    let id = match bitmask_data.next_one_bit(i) {
                        Some(v) => v,
                        None => break,
                    };
                    i = id + 1;
                    id as u32
                }
            };

            if token_id < match_results.position {
                return Err(QueryExecError::new("Token ID is less than match position"));
            }
            results.push(token_id - match_results.position);
        }
        profiler.phase("Compute page token IDs");
        Ok((results, n))
    }

    /// Filters a list of candidates into just the actual matches.
    fn filter_candidates(
        &self,
        candidates: &IntermediateResult,
        query_length: usize,
        page_start: usize,
        page_size: Option<usize>,
        profiler: &mut TimeProfiler,
    ) -> Result<(Vec<u32>, usize), QueryExecError> {
        // There can be no hard breaks between tokens without multiple tokens.
        if query_length < 2 {
            return self.compute_page_result(candidates, page_start, page_size, profiler);
        }
        // We compute a break mask, which is the negation of the hard breaks smeared left.
        // We will eventually do an index AND with this.
        // For example, consider a query length of 3.
        // We would smear 3 - 2 = 1 unit to the left.
        //
        // Below we have
        // - tokens
        // - hard breaks
        // - smeared breaks
        // - negated breaks
        // A B C D. E F G
        // 0 0 0 1  0 0 0
        // 0 0 1 1  0 0 0
        // 1 1 0 0  1 1 1
        //
        // Thus a candidate that started at A would be
        // legal, because A B C doesn't contain a break.
        // But C D E and D E F both have a period in the middle,
        // so they have the 0 bit set.

        let hard_breaks = self.get_hard_breaks()?;
        let break_mask = if query_length == 2 {
            hard_breaks.data.iter().map(|x| !*x).collect::<Vec<_>>()
        } else {
            smear_bitmask(&hard_breaks.data, query_length - 2, "left")
                .iter()
                .map(|x| !*x)
                .collect::<Vec<_>>()
        };
        let break_mask = IndexData::PackedBitMask(PackedBitMask {
            data: break_mask,
            num_set: None,
        });
        profiler.phase("Compute break mask");

        // As a future optimization, we can apply the AND in-place on the break mask since we never use it again.
        let (data, position) =
            apply_and_to_indices(&candidates.data, candidates.position, &break_mask, 0)?;

        let match_results = IntermediateResult { data, position };
        profiler.phase("Apply break mask");
        self.compute_page_result(&match_results, page_start, page_size, profiler)
    }

    fn resolve_match_tokens(
        &self,
        token_ids: &[u32],
        query_length: usize,
        context_len: usize,
    ) -> Result<Vec<CorpusQueryMatch<'_>>, QueryExecError> {
        if token_ids.is_empty() {
            return Ok(vec![]);
        }

        // Left start byte, Text start byte, Right start byte, Right end byte
        let mut starts: Vec<(usize, usize, usize, usize)> = Vec::with_capacity(token_ids.len());
        for &token_id in token_ids {
            let left_start_idx = max(0, token_id.saturating_sub(context_len as u32)) as usize;
            let right_end_idx = min(
                token_id as usize + query_length + context_len,
                self.corpus.stats.total_words as usize,
            );

            let left_start_byte = self.corpus.token_starts[left_start_idx] as usize;
            let text_start_byte = self.corpus.token_starts[token_id as usize] as usize;
            let right_start_byte =
                self.corpus.break_starts[token_id as usize + query_length - 1] as usize;
            let right_end_byte = self.corpus.break_starts[right_end_idx - 1] as usize;
            starts.push((
                left_start_byte,
                text_start_byte,
                right_start_byte,
                right_end_byte,
            ));
        }
        // Warm up the ranges that we're about to access.
        self.text
            .advise_range(starts[0].0, starts[starts.len() - 1].3);

        // Compute the metadata while the OS is (hopefully) loading the pages into memory.
        let mut metadata: Vec<CorpusQueryMatchMetadata> = Vec::with_capacity(token_ids.len());
        for &id in token_ids {
            metadata.push(self.resolve_match_token(id)?);
        }

        // Read the text chunks.
        let text_parts = starts
            .iter()
            .map(|&(a, b, c, d)| {
                let left_context = self.text.slice(a, b);
                let text = self.text.slice(b, c);
                let right_context = self.text.slice(c, d);
                (left_context, text, right_context)
            })
            .collect::<Vec<_>>();

        let matches = metadata
            .into_iter()
            .zip(text_parts)
            .map(|(meta, (left, text, right))| CorpusQueryMatch {
                metadata: meta,
                left_context: left,
                text,
                right_context: right,
            })
            .collect();

        Ok(matches)
    }

    /// Resolves a match token into a full result.
    fn resolve_match_token(
        &self,
        token_id: u32,
    ) -> Result<CorpusQueryMatchMetadata<'_>, QueryExecError> {
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
                QueryExecError::new(&format!("TokenId {token_id} not found in any work."))
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
            .map(|i| &row_data[i])
            .map_err(|_| {
                QueryExecError::new(&format!(
                    "TokenId {token_id} not found in any row for work index {work_idx}."
                ))
            })?;

        let (work_id, row_ids, work_data) = &self.corpus.work_lookup[work_idx];
        let row_idx = row_info.0 as usize;

        Ok(CorpusQueryMatchMetadata {
            work_id,
            work_name: &work_data.name,
            author: &work_data.author,
            section: row_ids[row_idx].join("."),
            offset: token_id - row_info.1,
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
        // Assemble the query
        let query = parse_query(query_str).map_err(|e| QueryExecError::new(&e.message))?;
        let num_terms = query.terms.len();
        let terms = query
            .terms
            .iter()
            .map(|term| self.convert_query_term(term))
            .collect::<Result<Vec<_>, _>>()?;
        profiler.phase("Parse query");

        // Find the possible matches, then filter them
        let candidates = match self.compute_query_candidates(&terms, &mut profiler)? {
            Some(res) => res,
            None => return Ok(empty_result()),
        };
        let (match_ids, total_results) =
            self.filter_candidates(&candidates, num_terms, page_start, page_size, &mut profiler)?;

        // Turn the match IDs into actual matches (with the text and locations).
        let context_len = context_len
            .unwrap_or(DEFAULT_CONTEXT_LEN)
            .clamp(1, MAX_CONTEXT_LEN);
        let matches = self.resolve_match_tokens(&match_ids, num_terms, context_len)?;
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
