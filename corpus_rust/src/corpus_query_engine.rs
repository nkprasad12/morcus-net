mod corpus_data_readers;
mod index_calculation;
mod query_conversion;

use crate::bitmask_utils::next_one_bit;
use crate::byte_readers::{InMemoryReader, MmapReader};
use crate::common::IndexDataRoO;
use crate::corpus_query_engine::corpus_data_readers::{CorpusText, IndexBuffers, TokenStarts};
use crate::packed_index_utils::smear_bitmask;
use crate::query_parsing_v2::parse_query;

use super::common::IndexData;
use super::corpus_serialization::LatinCorpusIndex;
use super::packed_index_utils::apply_and_to_indices;
use super::profiler::TimeProfiler;

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

struct IntermediateResult<'a> {
    data: IndexDataRoO<'a>,
    position: u32,
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    text: CorpusText<MmapReader>,
    raw_buffers: IndexBuffers<InMemoryReader>,
    starts: TokenStarts<MmapReader>,
}

impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, Box<dyn Error>> {
        let text = CorpusText::new(&corpus.raw_text_path)?;
        let raw_buffers = IndexBuffers::new(&corpus.raw_buffer_path)?;
        let starts = TokenStarts::new(&corpus.token_starts_path)?;
        Ok(CorpusQueryEngine {
            corpus,
            text,
            raw_buffers,
            starts,
        })
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
        let matches = match_results.data.to_ref();

        // Get to the start of the page.
        let mut results: Vec<u32> = vec![];
        let mut i: usize = match &matches {
            IndexData::List(_) => page_start,
            IndexData::BitMask(bitmask) => {
                let mut start_idx = 0;
                for _ in 0..page_start {
                    start_idx = next_one_bit(bitmask, start_idx)
                        .ok_or(QueryExecError::new("Not enough results for page"))?
                        + 1;
                }
                start_idx
            }
        };

        let n = matches.num_elements();
        while results.len() < page_size {
            let token_id = match matches {
                IndexData::List(data) => {
                    if i >= n {
                        break;
                    }
                    let id = data[i];
                    i += 1;
                    id
                }
                IndexData::BitMask(bitmask) => {
                    let id = match next_one_bit(bitmask, i) {
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
            hard_breaks.iter().map(|x| !*x).collect::<Vec<_>>()
        } else {
            let mut smeared = smear_bitmask(hard_breaks, query_length - 2, "left");
            for elem in &mut smeared {
                *elem = !*elem;
            }
            smeared
        };
        let break_mask = IndexData::BitMask(&break_mask);
        profiler.phase("Compute break mask");

        // As a future optimization, we can apply the AND in-place on the break mask since we never use it again.
        let (data, position) = apply_and_to_indices(
            &candidates.data.to_ref(),
            candidates.position,
            &break_mask,
            0,
        )?;

        let match_results = IntermediateResult {
            data: IndexDataRoO::Owned(data),
            position,
        };
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
