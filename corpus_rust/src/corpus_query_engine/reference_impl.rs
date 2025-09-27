#![cfg(test)]

use std::cmp::min;
use std::env::set_current_dir;

use crate::corpus_index::deserialize_corpus;
use crate::query_parsing_v2::QueryRelation;
use crate::{
    api::CorpusQueryMatch,
    bitmask_utils::from_bitmask,
    corpus_query_engine::{
        CorpusQueryEngine, CorpusQueryResult, IndexData, QueryExecError,
        index_data::{apply_and_with_arrays, apply_or_with_arrays},
    },
    query_parsing_v2::{QueryTerm, TokenConstraint, parse_query},
};

const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";

pub(super) fn get_engine_unsafe() -> Option<CorpusQueryEngine> {
    set_current_dir("..").unwrap();
    let index = match deserialize_corpus(CORPUS_ROOT) {
        Ok(index) => index,
        Err(e) => {
            eprintln!("Failed to load corpus: {}", e);
            return None;
        }
    };
    match CorpusQueryEngine::new(index) {
        Ok(e) => Some(e),
        Err(e) => {
            eprintln!("Failed to create query engine: {}", e);
            None
        }
    }
}

fn arr_has_any_in_range(arr: &[u32], range: &(u32, u32)) -> bool {
    let (start, end) = range;
    if start > end || arr.is_empty() {
        return false;
    }
    let idx = match arr.binary_search(start) {
        Ok(i) => i,
        Err(i) => i,
    };
    idx < arr.len() && arr[idx] <= *end
}

impl CorpusQueryEngine {
    fn hard_breaks_ref_impl(&self) -> Result<Vec<u32>, QueryExecError> {
        let breaks_metadata = self
            .corpus
            .indices
            .get("breaks")
            .unwrap()
            .get("hard")
            .unwrap();
        let hard_breaks = self
            .raw_buffers
            .resolve_index(breaks_metadata, self.corpus.num_tokens)
            .unwrap();
        match hard_breaks {
            IndexData::List(list) => Ok(list.to_vec()),
            IndexData::BitMask(bitmask) => Ok(from_bitmask(bitmask)),
        }
    }

    fn index_for_constraint(
        &self,
        constraint: &TokenConstraint,
    ) -> Result<Vec<u32>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => {
                let metadata = self.get_metadata_for(atom).unwrap();
                let index = self
                    .raw_buffers
                    .resolve_index(metadata, self.corpus.num_tokens)
                    .unwrap();
                match index {
                    IndexData::List(list) => Ok(list.to_vec()),
                    IndexData::BitMask(bitmask) => Ok(from_bitmask(bitmask)),
                }
            }
            TokenConstraint::Composed { op, children } => {
                if children.is_empty() {
                    return Ok(vec![]);
                }
                let mut results = self.index_for_constraint(&children[0])?;
                for child in &children[1..] {
                    let child_results = self.index_for_constraint(child)?;
                    results = match op {
                        crate::query_parsing_v2::TokenConstraintOperation::And => {
                            apply_and_with_arrays(&results, &child_results, 0)
                        }
                        crate::query_parsing_v2::TokenConstraintOperation::Or => {
                            apply_or_with_arrays(&results, &child_results, 0)
                        }
                    };
                }
                Ok(results)
            }
            _ => Err(QueryExecError {
                message: "Unimplemented".to_string(),
            }),
        }
    }

    fn index_for_term(&self, term: &QueryTerm) -> Result<Vec<u32>, QueryExecError> {
        self.index_for_constraint(&term.constraint)
    }

    fn resolve_match_ref_impl(
        &'_ self,
        id_ranges: &[(u32, u32)],
        context_len: usize,
    ) -> Result<CorpusQueryMatch<'_>, QueryExecError> {
        let sorted_ranges = {
            let mut v = id_ranges.to_vec();
            v.sort_by_key(|k| k.0);
            v
        };
        // (ID, should_use_token, is_match_text_start)
        let mut id_chunks = vec![];
        id_chunks.push((
            sorted_ranges[0].0.saturating_sub(context_len as u32),
            true,
            false,
        ));
        for &(start, end) in &sorted_ranges {
            let last = id_chunks.last().unwrap();
            assert!(start >= last.0);
            // Start at the start of the token
            id_chunks.push((start, true, true));
            // End at the start of the break.
            id_chunks.push((end, false, false));
        }
        id_chunks.push((
            min(
                id_chunks.last().unwrap().0 + context_len as u32,
                self.corpus.num_tokens - 1,
            ),
            false,
            false,
        ));

        let mut text = vec![];
        for i in 0..id_chunks.len() - 1 {
            let (start_id, use_token, is_match_start) = id_chunks[i];
            let start = if use_token {
                self.starts.token_start(start_id)?
            } else {
                self.starts.break_start(start_id)?
            };
            let (end_id, use_token, _) = id_chunks[i + 1];
            let end = if use_token {
                self.starts.token_start(end_id)?
            } else {
                self.starts.break_start(end_id)?
            };
            text.push((self.text.slice(start, end), is_match_start));
        }

        Ok(CorpusQueryMatch {
            metadata: self.corpus.resolve_match_token(sorted_ranges[0].0)?,
            text,
        })
    }

    fn query_corpus_ref_impl(
        &self,
        query_str: &str,
        page_start: usize,
        page_size: usize,
        context_len: usize,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let query =
            parse_query(query_str).map_err(|_| QueryExecError::new("Failed to parse query"))?;
        let first = &query.terms[0];
        let mut candidates: Vec<Vec<(u32, u32)>> = self
            .index_for_term(first)?
            .iter()
            .map(|x| vec![(*x, *x)])
            .collect();

        for (i, term) in query.terms.iter().enumerate().skip(1) {
            if term.relation != QueryRelation::After && term.relation != QueryRelation::First {
                return Err(QueryExecError::new(
                    "Reference impl doesn't support proximity",
                ));
            }
            let term_index = self.index_for_term(term)?;
            let term_set: std::collections::HashSet<u32> = term_index
                .iter()
                .filter(|x| **x >= i as u32)
                .map(|x| *x - i as u32)
                .collect();
            candidates = candidates
                .iter()
                .filter(|entry| term_set.contains(&(entry[0].0)))
                // Extend the range by 1 to include the new term.
                .map(|entry| vec![(entry[0].0, entry[0].1 + 1)])
                .collect();
        }

        let hard_breaks = self.hard_breaks_ref_impl()?;
        let match_ids: Vec<&Vec<(u32, u32)>> = candidates
            .iter()
            // -1 because we only care about breaks between tokens, not after the last token.
            .filter(|x| !arr_has_any_in_range(&hard_breaks, &(x[0].0, x[0].1 - 1)))
            .collect();
        let matches: Vec<CorpusQueryMatch<'_>> = match_ids
            .iter()
            .skip(page_start)
            .take(page_size)
            .map(|x| self.resolve_match_ref_impl(x, context_len).unwrap())
            .collect();
        let result = CorpusQueryResult {
            total_results: match_ids.len(),
            page_start,
            timing: vec![],
            matches,
        };

        Ok(result)
    }

    pub(super) fn compare_ref_impl_results(
        &self,
        query: &str,
        page_start: usize,
        page_size: usize,
        context_len: usize,
    ) {
        let start = std::time::Instant::now();
        let result_prod = self
            .query_corpus(query, page_start, page_size, context_len)
            .unwrap_or_else(|e| panic!("Query failed on real engine: {query}\n  {:?}", e));
        let prod_time = start.elapsed().as_secs_f64();
        let start = std::time::Instant::now();
        let result_ref = self
            .query_corpus_ref_impl(query, page_start, page_size, context_len)
            .unwrap_or_else(|e| panic!("Query failed on reference engine: {query}\n  {:?}", e));
        let fraction_time = start.elapsed().as_secs_f64() / prod_time;
        println!(
            "Ref impl is {fraction_time:.2}x\n - [{} {} {} {}]",
            query, page_start, page_size, context_len
        );
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
