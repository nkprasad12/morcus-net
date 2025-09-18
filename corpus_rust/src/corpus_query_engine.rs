use crate::common::{PackedBitMask, u32_from_bytes, u64_from_bytes};
use crate::corpus_serialization::StoredMapValue;
use crate::packed_index_utils::{apply_or_to_indices, smear_bitmask};
use crate::query_parsing_v2::{
    QueryRelation, QueryTerm, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    parse_query,
};

use super::common::IndexData;
use super::corpus_serialization::LatinCorpusIndex;
use super::packed_index_utils::apply_and_to_indices;
use super::profiler::TimeProfiler;

use crate::byte_readers::{InMemoryReader, MmapReader, RawByteReader};

use serde::Serialize;
use std::cmp::{max, min};
use std::error::Error;

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

struct TokenStarts {
    reader: MmapReader,
}

impl TokenStarts {
    pub fn new(token_starts_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = MmapReader::new(token_starts_path)?;
        Ok(TokenStarts { reader })
    }

    pub fn token_start(&self, token_id: u32) -> Result<usize, String> {
        let i = ((token_id * 2) * 4) as usize;
        Ok(u32_from_bytes(self.reader.bytes(i, i + 4))?[0] as usize)
    }

    pub fn break_start(&self, token_id: u32) -> Result<usize, String> {
        let i = ((token_id * 2 + 1) * 4) as usize;
        Ok(u32_from_bytes(self.reader.bytes(i, i + 4))?[0] as usize)
    }
}

struct CorpusText {
    reader: MmapReader,
}

impl CorpusText {
    pub fn new(raw_text_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = MmapReader::new(raw_text_path)?;
        Ok(CorpusText { reader })
    }

    pub fn slice(&self, start: usize, end: usize) -> String {
        // We store the starts of each word as byte offsets, so this should always be valid UTF-8.
        unsafe { String::from_utf8_unchecked(self.reader.bytes(start, end).to_vec()) }
    }

    pub fn advise_range(&self, start: usize, end: usize) {
        self.reader.advise_range(start, end);
    }
}

struct RawBuffers {
    reader: InMemoryReader,
}

impl RawBuffers {
    pub fn new(raw_buffer_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = InMemoryReader::new(raw_buffer_path)?;
        Ok(RawBuffers { reader })
    }

    pub fn resolve_index(
        &self,
        data: &StoredMapValue,
        num_tokens: u32,
    ) -> Result<IndexData, String> {
        match data {
            StoredMapValue::Packed { offset, len } => Ok(IndexData::Unpacked(
                u32_from_bytes(
                    self.reader
                        .bytes(*offset as usize, (*offset + (4 * *len)) as usize),
                )?
                .to_vec(),
            )),
            StoredMapValue::BitMask { offset, .. } => {
                let num_words = (num_tokens as usize).div_ceil(64);
                let bytes = self
                    .reader
                    .bytes(*offset as usize, *offset as usize + (num_words * 8));
                Ok(IndexData::PackedBitMask(PackedBitMask {
                    data: u64_from_bytes(bytes)?.to_vec(),
                }))
            }
        }
    }

    pub fn num_elements(&self, data: &StoredMapValue) -> u32 {
        match data {
            StoredMapValue::Packed { len, .. } => *len,
            StoredMapValue::BitMask { num_set, .. } => *num_set,
        }
    }
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    text: CorpusText,
    raw_buffers: RawBuffers,
    starts: TokenStarts,
}

// Methods for converting a query to an internal form.
impl CorpusQueryEngine {
    /// Get the size bounds for a token constraint atom. This should be present in the raw data.
    fn get_bounds_for_atom(&self, atom: &TokenConstraintAtom) -> SizeBounds {
        let metadata = match self.get_metadata_for(atom) {
            Some(m) => m,
            None => {
                return SizeBounds { upper: 0, lower: 0 };
            }
        };
        let elements_in_index = self.raw_buffers.num_elements(metadata);
        SizeBounds {
            upper: elements_in_index as usize,
            lower: elements_in_index as usize,
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
                let n = self.corpus.num_tokens as usize;
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
            TokenConstraint::Atom(atom) => Ok(self.index_for_atom(atom)),
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

    fn get_metadata_for(&self, part: &TokenConstraintAtom) -> Option<&StoredMapValue> {
        match part {
            TokenConstraintAtom::Word(word) => self.get_metadata("word", &word.to_lowercase()),
            TokenConstraintAtom::Lemma(lemma) => self.get_metadata("lemma", lemma),
            &TokenConstraintAtom::Inflection(inflection) => {
                self.get_metadata(inflection.get_label(), &inflection.get_code())
            }
        }
    }

    fn index_for_atom(&self, part: &TokenConstraintAtom) -> Option<IndexData> {
        self.index_for_metadata(self.get_metadata_for(part)?)
    }

    fn index_for_metadata(&self, metadata: &StoredMapValue) -> Option<IndexData> {
        self.raw_buffers
            .resolve_index(metadata, self.corpus.num_tokens)
            .ok()
    }

    fn get_metadata(&self, key: &str, value: &str) -> Option<&StoredMapValue> {
        self.corpus.indices.get(key)?.get(value)
    }

    fn get_index(&self, key: &str, value: &str) -> Option<IndexData> {
        self.index_for_metadata(self.get_metadata(key, value)?)
    }
}

// Core, high level logic for query execution.
impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, Box<dyn Error>> {
        let text = CorpusText::new(&corpus.raw_text_path)?;
        let raw_buffers = RawBuffers::new(&corpus.raw_buffer_path)?;
        let starts = TokenStarts::new(&corpus.token_starts_path)?;
        Ok(CorpusQueryEngine {
            corpus,
            text,
            raw_buffers,
            starts,
        })
    }

    /// Returns the hard breaks, verifying that it is a bitmask.
    fn get_hard_breaks(&self) -> Result<PackedBitMask, QueryExecError> {
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
        let page_size = page_size.unwrap_or(10000);

        // Get to the start of the page.
        let mut results: Vec<u32> = vec![];
        let mut i: usize = match &match_results.data {
            IndexData::Unpacked(_) => page_start,
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
        let break_mask = IndexData::PackedBitMask(PackedBitMask { data: break_mask });
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
        query_length: u32,
        context_len: u32,
    ) -> Result<Vec<CorpusQueryMatch<'_>>, QueryExecError> {
        if token_ids.is_empty() {
            return Ok(vec![]);
        }

        // Left start byte, Text start byte, Right start byte, Right end byte
        let mut starts: Vec<(usize, usize, usize, usize)> = Vec::with_capacity(token_ids.len());
        for &token_id in token_ids {
            let left_start_idx = max(0, token_id.saturating_sub(context_len));
            let right_end_idx = min(
                token_id + query_length + context_len,
                self.corpus.num_tokens,
            );

            let left_start_byte = self.starts.token_start(left_start_idx)?;
            let text_start_byte = self.starts.token_start(token_id)?;
            let right_start_byte = self.starts.break_start(token_id + (query_length - 1))?;
            let right_end_byte = self.starts.break_start(right_end_idx - 1)?;
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
        let matches =
            self.resolve_match_tokens(&match_ids, num_terms as u32, context_len as u32)?;
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
