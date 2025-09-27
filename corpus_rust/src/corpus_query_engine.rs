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
    use std::env::set_current_dir;

    use crate::corpus_index::deserialize_corpus;

    use super::*;

    const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

    macro_rules! generate {
        ($query:expr, $page_size:expr, $context_len:expr) => {
            &[
                ($query, 0, $page_size, $context_len),
                ($query, 5, $page_size, $context_len),
                ($query, 50, $page_size, $context_len),
            ]
        };
    }

    // (query, page_start, page_size, context_len)
    const TEST_QUERIES: &[&[(&str, usize, usize, usize)]] = &[
        generate!("@lemma:do", 25, 10),
        generate!("(@lemma:habeo and @voice:passive)", 50, 20),
        generate!("(@case:dat or @voice:passive)", 5, 20),
        generate!("(@case:dat or (@voice:passive and @lemma:do))", 25, 20),
    ];

    #[test]
    fn validate_queries() {
        // Note: for now we are OK silently passing the test if the corpus
        // fails to load, because the CI doesn't handle building the index yet.
        set_current_dir("..").unwrap();
        let index = match deserialize_corpus(CORPUS_ROOT) {
            Ok(index) => index,
            Err(e) => {
                eprintln!("Failed to load corpus: {}", e);
                return;
            }
        };
        let engine = match CorpusQueryEngine::new(index) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Failed to create query engine: {}", e);
                return;
            }
        };

        for (query, page_start, page_size, context_len) in
            TEST_QUERIES.iter().flat_map(|s| s.iter().copied())
        {
            let result_prod = engine
                .query_corpus(query, page_start, page_size, context_len)
                .unwrap_or_else(|e| panic!("Query failed on real engine: {query}\n  {:?}", e));
            let result_ref = engine
                .query_corpus_ref_impl(query, page_start, page_size, context_len)
                .unwrap_or_else(|e| panic!("Query failed on reference engine: {query}\n  {:?}", e));

            let query_details = format!(
                "Query: {query}, page_start: {page_start}, page_size: {page_size}, context_len: {context_len}"
            );
            assert_eq!(
                result_prod.page_start, result_ref.page_start,
                "Different `page_start`s for query {query_details}"
            );
            assert_eq!(
                result_prod.total_results, result_ref.total_results,
                "Different `total_result`s for {query_details}"
            );
            let mut prod_iter = result_prod.matches.iter();
            let mut ref_iter = result_ref.matches.iter();
            let mut i = 0;
            loop {
                i += 1;
                let prod_next = prod_iter.next();
                let ref_next = ref_iter.next();
                assert_eq!(
                    prod_next, ref_next,
                    "Mismatch at result {i} [{query_details}]"
                );
                if prod_next.is_none() || ref_next.is_none() {
                    break;
                }
            }
        }
    }
}
