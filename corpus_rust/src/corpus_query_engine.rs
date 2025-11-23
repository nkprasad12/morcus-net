mod corpus_candidate_filtering;
mod corpus_data_readers;
mod corpus_index_calculation;
mod corpus_query_conversion;
mod corpus_result_resolution;
mod errors;
mod index_data;
mod reference_impl;

use crate::api::{CorpusQueryResult, PageData, QueryExecError, QueryGlobalInfo};
use crate::corpus_query_engine::corpus_candidate_filtering::{MatchIterator, next_page_data};
use crate::corpus_query_engine::corpus_data_readers::{CorpusText, IndexBuffers, TokenStarts};
use crate::corpus_query_engine::corpus_result_resolution::get_match_page;
use crate::corpus_query_engine::index_data::{IndexData, IndexDataRoO, IndexRange};
use crate::query_parsing_v2::{Query, parse_query};

use super::corpus_index::LatinCorpusIndex;
use super::profiler::TimeProfiler;

use std::error::Error;

fn empty_result() -> CorpusQueryResult<'static> {
    CorpusQueryResult {
        result_stats: QueryGlobalInfo {
            total_results: 0,
            exact_count: Some(true),
        },
        matches: vec![],
        next_page: None,
        timing: vec![],
    }
}

/// An engine for querying a corpus.
pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    text: CorpusText,
    raw_buffers: IndexBuffers,
    starts: TokenStarts,
}

impl CorpusQueryEngine {
    /// Creates a new query engine from the given corpus index.
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, Box<dyn Error>> {
        let (starts, text, raw_buffers) = corpus_data_readers::data_readers(&corpus)?;
        Ok(CorpusQueryEngine {
            corpus,
            text,
            raw_buffers,
            starts,
        })
    }

    fn compute_range(&self, query: &Query) -> Result<IndexRange, QueryExecError> {
        if query.authors.len() > 1 {
            return Err(QueryExecError::new(
                "Multiple authors in query not currently supported",
            ));
        }
        if query.authors.is_empty() {
            let num_words = self.corpus.num_tokens.div_ceil(64);
            let range = IndexRange {
                start: 0,
                end: num_words * 64,
            };
            return Ok(range);
        }
        let author = &query.authors[0];
        let (start, end) = match self.corpus.author_lookup.get(author) {
            Some(v) => *v,
            None => {
                return Err(QueryExecError::new(&format!(
                    "Author '{}' not found in corpus",
                    author
                )));
            }
        };
        let start = self.corpus.work_lookup[start].1[0].1;
        let end_work_sections = &self.corpus.work_lookup[end].1;
        let end = end_work_sections[end_work_sections.len() - 1].2;
        // The range must be aligned to word boundaries.
        Ok(IndexRange {
            start: (start / 64) * 64,
            end: end.div_ceil(64) * 64,
        })
    }

    /// Queries the corpus with the given parameters.
    /// - `query_str`: The query string to execute.
    /// - `page_data`: Metadata required to find the correct page of results.
    /// - `page_size`: The maximum number of results to return. If `None`, a large default is used.
    /// - `context_len`: The number of tokens of context to include around each match. If `None`, defaults to 25.
    ///
    /// Returns matches (and metadata) for the query.
    pub fn query_corpus(
        &self,
        query_str: &str,
        page_data: &PageData,
        page_size: usize,
        context_len: usize,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let mut profiler = TimeProfiler::new();
        // Assemble the query
        let query = parse_query(query_str).map_err(|e| QueryExecError::new(&e.message))?;
        let terms = query
            .terms
            .iter()
            .map(|term| self.convert_query_term(term))
            .collect::<Result<Vec<_>, _>>()?;
        let query_spans = corpus_index_calculation::split_into_spans(&terms)?;
        if query_spans.len() > 20 {
            return Err(QueryExecError::new(
                "Queries with more than 20 term groups are not supported",
            ));
        }
        profiler.phase("Parse query");

        // Find the possible matches, then filter them
        let range = self.compute_range(&query)?;
        let span_candidates =
            match self.candidates_for_spans(&query_spans, &range, &mut profiler)? {
                Some(res) => res,
                None => return Ok(empty_result()),
            };
        let candidates = self.compute_query_candidates(&span_candidates)?;
        let total_candidates = candidates.data.to_ref().num_elements();
        let mut candidate_iter = MatchIterator::new(&candidates, page_data);
        let match_leaders = get_match_page(
            &mut candidate_iter,
            &span_candidates,
            &query_spans,
            page_size,
        )?;
        let skipped_candidates = match_leaders.skipped_candidates;

        // Turn the match IDs into actual matches (with the text and locations).
        let matches = self.resolve_match_tokens(match_leaders.matches, context_len as u32)?;
        profiler.phase("Build Matches");
        let result_stats = QueryGlobalInfo {
            total_results: total_candidates,
            exact_count: Some(true),
        };
        let next_page = next_page_data(
            &mut candidate_iter,
            page_data,
            page_size,
            skipped_candidates,
        )?;
        Ok(CorpusQueryResult {
            result_stats,
            matches,
            next_page,
            timing: profiler.get_stats().to_vec(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    macro_rules! generate {
        ($query:expr) => {
            &[
                (
                    $query,
                    PageData {
                        result_index: 0,
                        result_id: 0,
                        candidate_index: 0,
                    },
                    5,
                    15,
                ),
                (
                    $query,
                    PageData {
                        result_index: 0,
                        result_id: 0,
                        candidate_index: 0,
                    },
                    25,
                    10,
                ),
                (
                    $query,
                    PageData {
                        result_index: 5,
                        result_id: 0,
                        candidate_index: 0,
                    },
                    5,
                    10,
                ),
                (
                    $query,
                    PageData {
                        result_index: 50,
                        result_id: 0,
                        candidate_index: 0,
                    },
                    5,
                    10,
                ),
            ]
        };
    }

    // (query, page_start, page_size, context_len)
    const TEST_QUERIES: &[&[(&str, PageData, usize, usize)]] = &[
        generate!("@lemma:do"),
        generate!("@case:dat"),
        generate!("(@lemma:habeo and @voice:passive)"),
        generate!("(@case:dat or @voice:passive)"),
        generate!("(@case:dat or (@voice:passive and @lemma:do))"),
        generate!("@lemma:do oscula @case:dat"),
        generate!("[Ovid] @lemma:do oscula @case:dat"),
        generate!("@case:dat @case:acc"),
        generate!("@case:dat @case:nom et"),
    ];

    #[test]
    fn validate_queries() {
        let engine = match reference_impl::get_engine_unsafe() {
            Some(e) => e,
            // Note: for now we are OK silently passing the test if the corpus
            // fails to load, because the CI doesn't handle building the index yet
            None => return,
        };
        let test_queries = TEST_QUERIES.iter().flat_map(|s| s.iter());
        for (query, page_data, page_size, context_len) in test_queries {
            engine.compare_ref_impl_results(query, page_data, *page_size, *context_len);
        }
    }
}
