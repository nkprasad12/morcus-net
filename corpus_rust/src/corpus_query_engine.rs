mod corpus_candidate_filtering;
mod corpus_data_readers;
mod corpus_index_calculation;
mod corpus_query_conversion;
mod corpus_result_resolution;
mod errors;
mod index_data;
mod query_pruning;
mod query_validation;
mod reference_impl;

use crate::api::{CorpusQueryResult, PageData, QueryExecError, QueryGlobalInfo, QueryOptions};
use crate::corpus_query_engine::corpus_candidate_filtering::MatchIterator;
use crate::corpus_query_engine::corpus_data_readers::{
    CorpusText, IndexBuffers, InflectionLookup, TokenStarts,
};
use crate::corpus_query_engine::corpus_result_resolution::get_match_page;
use crate::corpus_query_engine::index_data::{IndexData, IndexDataRoO, IndexRange, TokenScope};
use crate::corpus_query_engine::query_pruning::prune_query;
use crate::corpus_query_engine::query_validation::is_query_currently_supported;
use crate::query_parsing_v2::{Query, parse_query};

use super::corpus_index::LatinCorpusIndex;
use super::profiler::TimeProfiler;

use std::error::Error;

fn empty_result() -> CorpusQueryResult<'static> {
    CorpusQueryResult {
        result_stats: QueryGlobalInfo {
            estimated_results: 0,
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
    inflections: InflectionLookup,
}

impl CorpusQueryEngine {
    /// Creates a new query engine from the given corpus index.
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self, Box<dyn Error>> {
        let readers = corpus_data_readers::data_readers(&corpus)?;
        Ok(CorpusQueryEngine {
            corpus,
            starts: readers.0,
            text: readers.1,
            raw_buffers: readers.2,
            inflections: readers.3,
        })
    }

    /// Returns the word-aligned range to slice indices with, and the exact
    /// token scope that matches must fall within.
    fn compute_range(&self, query: &Query) -> Result<(IndexRange, TokenScope), QueryExecError> {
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
            let scope = TokenScope {
                start: 0,
                end: self.corpus.num_tokens,
            };
            return Ok((range, scope));
        }
        let author = &query.authors[0];
        let (start, end) = match self.corpus.author_lookup.get(author) {
            Some(v) => *v,
            None => {
                return Err(QueryExecError::new(&format!(
                    "Author '{author}' not found in corpus"
                )));
            }
        };
        let start = self.corpus.work_lookup[start].rows[0].1;
        let end_work_sections = &self.corpus.work_lookup[end].rows;
        let end = end_work_sections[end_work_sections.len() - 1].2;
        // The range must be aligned to word boundaries; the scope keeps the
        // exact bounds so the alignment padding doesn't leak matches.
        Ok((
            IndexRange {
                start: (start / 64) * 64,
                end: end.div_ceil(64) * 64,
            },
            TokenScope { start, end },
        ))
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
        options: &QueryOptions,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let context_len = options.context_len;
        let mut profiler = TimeProfiler::new();

        // Parse the query
        let query = parse_query(query_str).map_err(|e| QueryExecError::new(&e.message))?;
        if !is_query_currently_supported(&query) {
            return Err(QueryExecError::new(
                "The given query contains constructs that are not yet supported",
            ));
        }
        let query = match prune_query(query) {
            Ok(q) => q,
            // TODO: Pipe the error to the user.
            Err(_) => return Ok(empty_result()),
        };
        let terms = query
            .terms
            .iter()
            .map(|term| self.convert_query_term(term))
            .collect::<Result<Vec<_>, _>>()?;
        let query_spans = corpus_index_calculation::split_into_spans(&terms)?;
        if query_spans.len() > 10 {
            return Err(QueryExecError::new(
                "Queries with more than 10 term groups are not supported",
            ));
        }
        profiler.phase("Parse query");

        // Find the candidates for each span individually.
        let (range, scope) = self.compute_range(&query)?;
        let span_candidates =
            match self.candidates_for_spans(&query_spans, &range, &mut profiler)? {
                Some(res) => res,
                None => return Ok(empty_result()),
            };

        // Find the candidates that could match all spans.
        let candidates = self.compute_query_candidates(&span_candidates)?;
        let mut candidates = MatchIterator::new(&candidates, page_data, &scope);
        let total_candidates = candidates.num_candidates();
        profiler.phase("Combined candidates found");

        // Finds a page of actual matches from the candidates.
        let match_leaders = get_match_page(
            &mut candidates,
            &span_candidates,
            &query_spans,
            self,
            page_data,
            total_candidates,
            options,
        )?;
        profiler.phase("Match page computed");

        // Turn the match IDs into actual matches (with the text and locations).
        let matches = self.resolve_match_tokens(match_leaders.matches, context_len as u32)?;
        profiler.phase("Matches resolved");

        Ok(CorpusQueryResult {
            result_stats: match_leaders.summary_info,
            matches,
            next_page: match_leaders.next_page,
            timing: profiler.get_stats().to_vec(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_QUERIES: &[&str] = &[
        "@lemma:do",
        "@case:dat",
        "(@lemma:habeo and @voice:passive)",
        "(@case:dat or @voice:passive)",
        "@lemma:do oscula @case:dat",
        "[Ovid] @lemma:do oscula @case:dat",
        "@case:dat @case:acc",
        "@case:dat @case:nom et",
        "arma virumque",
        "in @case:abl",
    ];

    /// Author-restricted queries whose candidates end up as a bitmask, so paging
    /// exercises the slice-relative bitmask cursor in `MatchIterator::new`.
    /// Exact author bounds are covered by `validate_author_range_is_exact`.
    const AUTHOR_BITMASK_QUERIES: &[&str] = &["[Ovid] @case:dat @case:acc"];

    /// (page_size, context_len)
    const TEST_OPTIONS: &[(usize, usize)] = &[(5, 15), (25, 10)];

    /// How many pages to walk for each query, following the engine's own cursors.
    const PAGES_PER_QUERY: usize = 3;

    #[test]
    fn validate_queries() {
        walk_pages(TEST_QUERIES);
    }

    #[test]
    fn validate_author_bitmask_queries() {
        walk_pages(AUTHOR_BITMASK_QUERIES);
    }

    /// Author ranges are rounded out to 64-token boundaries for slicing. A
    /// common query restricted to each author is very likely to hit the
    /// padding before the author's first token, so this checks that matches
    /// and counts are clipped to the exact author range. `et` resolves to a
    /// `List` of candidates and `@case:dat @case:acc` to a `BitMask` (with a
    /// non-zero position), so both clipping paths are covered.
    #[test]
    fn validate_author_range_is_exact() {
        let engine = match reference_impl::get_engine_unsafe() {
            Some(e) => e,
            None => return,
        };
        let mut authors: Vec<&String> = engine.corpus.author_lookup.keys().collect();
        authors.sort();
        let options = QueryOptions {
            page_size: 5,
            context_len: 5,
            strict_mode: false,
        };
        for author in authors {
            for query in ["et", "@case:dat @case:acc"] {
                let query = format!("[{author}] {query}");
                engine.compare_ref_impl_results(&query, &PageData::default(), &options);
            }
        }
    }

    fn walk_pages(queries: &[&str]) {
        let engine = match reference_impl::get_engine_unsafe() {
            Some(e) => e,
            // Skip (with a warning) only if the corpus hasn't been built; a
            // corpus that exists but fails to load panics.
            None => return,
        };
        for query in queries {
            for &(page_size, context_len) in TEST_OPTIONS {
                let options = QueryOptions {
                    page_size,
                    context_len,
                    strict_mode: false,
                };
                let mut page_data = PageData::default();
                for _ in 0..PAGES_PER_QUERY {
                    match engine.compare_ref_impl_results(query, &page_data, &options) {
                        Some(next) => page_data = next,
                        None => break,
                    }
                }
            }
        }
    }
}
