mod corpus_candidate_filtering;
mod corpus_data_readers;
mod corpus_index_calculation;
mod corpus_query_conversion;
mod corpus_result_resolution;
mod errors;
mod index_data;
mod reference_impl;

use crate::api::{CorpusQueryResult, QueryExecError};
use crate::corpus_query_engine::corpus_data_readers::{CorpusText, IndexBuffers, TokenStarts};
use crate::corpus_query_engine::index_data::{IndexData, IndexDataRoO, IndexRange};
use crate::query_parsing_v2::parse_query;

use super::corpus_index::LatinCorpusIndex;
use super::profiler::TimeProfiler;

use std::error::Error;

fn empty_result() -> CorpusQueryResult<'static> {
    CorpusQueryResult {
        total_results: 0,
        matches: vec![],
        page_start: 0,
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

    /// Queries the corpus with the given parameters.
    /// - `query_str`: The query string to execute.
    /// - `page_start`: The index of the first result to return (0-based).
    /// - `page_size`: The maximum number of results to return. If `None`, a large default is used.
    /// - `context_len`: The number of tokens of context to include around each match. If `None`, defaults to 25.
    ///
    /// Returns matches (and metadata) for the query.
    pub fn query_corpus(
        &self,
        query_str: &str,
        page_start: usize,
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
        profiler.phase("Parse query");

        // Find the possible matches, then filter them
        let num_words = self.corpus.num_tokens.div_ceil(64);
        let range = IndexRange {
            start: 0,
            end: num_words * 64,
        };
        let candidates = match self.compute_query_candidates(&query_spans, &range, &mut profiler)? {
            Some(res) => res,
            None => return Ok(empty_result()),
        };
        // TODO: When we have proximity searches, we could potentially have spans that match with themselves,
        // technically giving matching within N tokens but they're not distinct terms. For now,
        // just include these misleading results.
        let (match_ids, total_results) =
            self.compute_page_result(&candidates, page_start, page_size, &mut profiler)?;

        // Turn the match IDs into actual matches (with the text and locations).
        let matches = self.resolve_match_tokens(&match_ids, &query_spans, context_len as u32)?;
        profiler.phase("Build Matches");

        Ok(CorpusQueryResult {
            total_results,
            matches,
            page_start,
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
                ($query, 0, 5, 15),
                ($query, 0, 25, 10),
                ($query, 5, 5, 10),
                ($query, 50, 5, 10),
            ]
        };
    }

    // (query, page_start, page_size, context_len)
    const TEST_QUERIES: &[&[(&str, usize, usize, usize)]] = &[
        generate!("@lemma:do"),
        generate!("@case:dat"),
        generate!("(@lemma:habeo and @voice:passive)"),
        generate!("(@case:dat or @voice:passive)"),
        generate!("(@case:dat or (@voice:passive and @lemma:do))"),
        generate!("@lemma:do oscula @case:dat"),
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
        for (query, page_start, page_size, context_len) in test_queries {
            engine.compare_ref_impl_results(query, *page_start, *page_size, *context_len);
        }
    }
}
