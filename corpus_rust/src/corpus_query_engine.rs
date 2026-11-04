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

/// The most authors a query's `[...]` prefix may list. The cost of a scope
/// depends on how much of the corpus it spans, not on how many authors it has,
/// so this is only a sanity limit.
const MAX_SCOPE_ITEMS: usize = 20;

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

    /// The `[start, end)` tokens of all of an author's works.
    fn resolve_author(&self, author: &str) -> Result<(u32, u32), QueryExecError> {
        // `author_lookup` holds an inclusive range of work indices.
        let (first, last) = match self.corpus.author_lookup.get(author) {
            Some(&works) => works,
            None => {
                return Err(QueryExecError::new(&format!(
                    "Author '{author}' not found in corpus"
                )));
            }
        };
        let start = self.corpus.work_lookup[first].rows[0].1;
        let last_rows = &self.corpus.work_lookup[last].rows;
        let end = last_rows[last_rows.len() - 1].2;
        Ok((start, end))
    }

    /// Returns the word-aligned range to slice indices with, and the exact
    /// token ranges that matches must fall within.
    fn compute_range(&self, query: &Query) -> Result<(IndexRange, TokenScope), QueryExecError> {
        if query.authors.len() > MAX_SCOPE_ITEMS {
            return Err(QueryExecError::new(&format!(
                "A query can be restricted to at most {MAX_SCOPE_ITEMS} authors"
            )));
        }
        let scope = if query.authors.is_empty() {
            TokenScope::new(vec![(0, self.corpus.num_tokens)])
        } else {
            let ranges = query
                .authors
                .iter()
                .map(|author| self.resolve_author(author))
                .collect::<Result<Vec<_>, _>>()?;
            TokenScope::new(ranges)
        };
        let (start, end) = scope
            .bounds()
            .ok_or_else(|| QueryExecError::new("The query's scope contains no text"))?;
        // The range must be aligned to word boundaries; the scope keeps the
        // exact ranges so the alignment padding and the gaps between ranges
        // don't leak matches.
        let range = IndexRange {
            start: (start / 64) * 64,
            end: end.div_ceil(64) * 64,
        };
        Ok((range, scope))
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
        walk_pages_with(&engine, queries);
    }

    /// Compares the first `PAGES_PER_QUERY` pages of each query against the
    /// reference implementation, following the engine's own cursors.
    fn walk_pages_with<S: AsRef<str>>(engine: &CorpusQueryEngine, queries: &[S]) {
        for query in queries {
            for &(page_size, context_len) in TEST_OPTIONS {
                let options = QueryOptions {
                    page_size,
                    context_len,
                    strict_mode: false,
                };
                let mut page_data = PageData::default();
                for _ in 0..PAGES_PER_QUERY {
                    match engine.compare_ref_impl_results(query.as_ref(), &page_data, &options) {
                        Some(next) => page_data = next,
                        None => break,
                    }
                }
            }
        }
    }

    /// Several authors: far apart (most of the span between them excluded),
    /// next to each other (merged into one range), and a mix of three.
    #[test]
    fn validate_multi_author_queries() {
        let engine = match reference_impl::get_engine_unsafe() {
            Some(e) => e,
            None => return,
        };
        let mut by_first_work: Vec<_> = engine.corpus.author_lookup.iter().collect();
        by_first_work.sort_by_key(|(_, works)| works.0);
        let (prev, next) = by_first_work
            .windows(2)
            .find(|pair| pair[0].1.1 + 1 == pair[1].1.0)
            .map(|pair| (pair[0].0, pair[1].0))
            .expect("two authors with adjacent works");
        let scopes = [
            "Cicero, Vergil".to_string(),
            format!("{prev}, {next}"),
            "Grattius, Vergil, Ovid".to_string(),
        ];
        let queries: Vec<String> = scopes
            .iter()
            .flat_map(|scope| {
                ["et", "@case:dat @case:acc", "in @case:abl"]
                    .map(|query| format!("[{scope}] {query}"))
            })
            .collect();
        walk_pages_with(&engine, &queries);
    }

    #[test]
    fn scope_errors() {
        let engine = match reference_impl::get_engine_unsafe() {
            Some(e) => e,
            None => return,
        };
        let options = QueryOptions {
            page_size: 5,
            context_len: 5,
            strict_mode: false,
        };
        let run = |query: &str| engine.query_corpus(query, &PageData::default(), &options);

        let unknown = run("[Cicero, Nobody] et").unwrap_err();
        assert!(unknown.message.contains("'Nobody'"), "{}", unknown.message);

        let items = |n: usize| vec!["Cicero"; n].join(", ");
        assert!(run(&format!("[{}] et", items(MAX_SCOPE_ITEMS))).is_ok());
        let too_many = run(&format!("[{}] et", items(MAX_SCOPE_ITEMS + 1))).unwrap_err();
        assert!(too_many.message.contains("at most"), "{}", too_many.message);
    }
}
