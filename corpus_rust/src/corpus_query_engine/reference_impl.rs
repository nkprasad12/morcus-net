#![cfg(test)]

use std::cmp::min;
use std::env::set_current_dir;

use crate::api::{PageData, QueryGlobalInfo};
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
            eprintln!("Failed to load corpus: {e}");
            return None;
        }
    };
    match CorpusQueryEngine::new(index) {
        Ok(e) => Some(e),
        Err(e) => {
            eprintln!("Failed to create query engine: {e}");
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

fn check_results_equal(
    prod: &CorpusQueryResult<'_>,
    reference: &CorpusQueryResult<'_>,
) -> Result<(), String> {
    if prod.next_page != reference.next_page {
        return Err(format!(
            "Different `next_page`s\n  Prod: {:?}\n  Ref: {:?}",
            prod.next_page, reference.next_page
        ));
    }
    if prod.result_stats != reference.result_stats {
        return Err(format!(
            "Different `result_stats`\n  Prod: {:?}\n  Ref: {:?}",
            prod.result_stats, reference.result_stats
        ));
    }
    let mut prod_iter = prod.matches.iter();
    let mut ref_iter = reference.matches.iter();
    let mut i = 0;
    loop {
        i += 1;
        let prod_next = prod_iter.next();
        let ref_next = ref_iter.next();
        if prod_next != ref_next {
            return Err(format!(
                "Mismatch at result {i}\n  Prod: {prod_next:?}\n  Ref: {ref_next:?}"
            ));
        }
        if prod_next.is_none() || ref_next.is_none() {
            break;
        }
    }
    Ok(())
}

impl CorpusQueryEngine {
    fn hard_breaks_ref_impl(&self) -> Result<Vec<u32>, QueryExecError> {
        let breaks_metadata = self
            .corpus
            .indices
            .get("breaks")
            .unwrap()
            .get(*self.corpus.id_table["breaks"].get("hard").unwrap() as usize)
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

    fn resolve_author_data(&self, name: Option<&String>) -> Option<(u32, u32)> {
        let name = name?;
        let (start, end) = self.corpus.author_lookup.get(name)?;
        let start_work = self.corpus.work_lookup[*start].1[0].1;
        let end_work = self.corpus.work_lookup[*end - 1].1.last()?.1;
        Some((start_work, end_work))
    }

    fn query_corpus_ref_impl(
        &self,
        query_str: &str,
        page_data: &PageData,
        page_size: usize,
        context_len: usize,
        use_index_for_page: bool,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let query =
            parse_query(query_str).map_err(|_| QueryExecError::new("Failed to parse query"))?;
        let first = &query.terms[0];

        struct SpanCandidate {
            ids: Vec<u32>,
            span_length: u32,
        }

        let first = SpanCandidate {
            ids: self.index_for_term(first)?,
            span_length: 1,
        };

        let mut candidates: Vec<SpanCandidate> = vec![first];

        for (i, term) in query.terms.iter().enumerate().skip(1) {
            let term_index = self.index_for_term(term)?;
            match term.relation {
                QueryRelation::After | QueryRelation::First => {
                    let term_set: std::collections::HashSet<u32> = term_index
                        .iter()
                        .filter(|x| **x >= i as u32)
                        .map(|x| *x - i as u32)
                        .collect();
                    let last = candidates.remove(candidates.len() - 1);
                    let updated_ids = last
                        .ids
                        .iter()
                        .filter(|x| term_set.contains(*x))
                        .copied()
                        .collect();
                    candidates.push(SpanCandidate {
                        ids: updated_ids,
                        span_length: last.span_length + 1,
                    });
                }
                _ => panic!("Unimplemented (proximity relation"),
            }
        }

        let hard_breaks = self.hard_breaks_ref_impl()?;
        // Just for now.
        assert!(query.authors.len() <= 1);
        let author_data = self.resolve_author_data(query.authors.first());
        let match_ids: Vec<SpanCandidate> = candidates
            .iter()
            .map(|SpanCandidate { ids, span_length }| {
                let ids = ids
                    .iter()
                    // -2 because we only care about breaks between tokens, not after the last token.
                    .filter(|x| !arr_has_any_in_range(&hard_breaks, &(**x, **x + span_length - 2)));
                let ids: Vec<u32> = if let Some(author_data) = author_data {
                    ids.filter(|x| **x >= author_data.0 && **x + span_length - 1 <= author_data.1)
                        .copied()
                        .collect()
                } else {
                    ids.copied().collect()
                };
                SpanCandidate {
                    ids,
                    span_length: *span_length,
                }
            })
            .collect();

        // For now, only take the first span. When we support proximity, we will need to handle multiple spans.
        let match_ids = match_ids[0]
            .ids
            .iter()
            .map(|&x| vec![(x, x + match_ids[0].span_length - 1)])
            .collect::<Vec<_>>();

        let page_match_ids = if use_index_for_page {
            match_ids
                .iter()
                .enumerate()
                .skip(page_data.result_index as usize)
                .take(page_size + 1)
                .collect::<Vec<_>>()
        } else {
            match_ids
                .iter()
                .enumerate()
                .filter(|(_i, x)| x[0].0 >= page_data.result_id)
                .take(page_size + 1)
                .collect::<Vec<_>>()
        };
        let matches = page_match_ids
            .iter()
            .take(page_size)
            .map(|(_i, x)| self.resolve_match_ref_impl(x, context_len).unwrap())
            .collect::<Vec<_>>();
        let next_page = page_match_ids.get(page_size).map(|(i, ranges)| PageData {
            result_index: *i as u32 + page_data.result_index,
            result_id: ranges[0].0,
            candidate_index: *i as u32 + page_data.result_index,
        });
        let result = CorpusQueryResult {
            result_stats: QueryGlobalInfo {
                estimated_results: match_ids.len(),
            },
            next_page,
            timing: vec![],
            matches,
        };

        Ok(result)
    }

    pub(super) fn compare_ref_impl_results(
        &self,
        query: &str,
        page_data: &PageData,
        page_size: usize,
        context_len: usize,
    ) {
        println!(
            "query={query} | page_data={page_data:?} | page_size={page_size} | context_len={context_len}"
        );
        let start = std::time::Instant::now();
        let result_prod = self
            .query_corpus(query, page_data, page_size, context_len)
            .unwrap_or_else(|e| panic!("Query failed on real engine: {query}\n  {e:?}"));
        let prod_time = start.elapsed().as_secs_f64();

        let mut errors = vec![];
        for use_index_for_page in [true, false] {
            let start = std::time::Instant::now();
            let result_ref = self.query_corpus_ref_impl(
                query,
                page_data,
                page_size,
                context_len,
                use_index_for_page,
            );
            let fraction_time = start.elapsed().as_secs_f64() / prod_time;
            let result_ref = result_ref.unwrap();
            let do_results_match = check_results_equal(&result_prod, &result_ref);
            match do_results_match {
                Ok(_) => {
                    println!("- Ref impl is {fraction_time:.2}x");
                    break;
                }
                Err(e) => errors.push(e),
            }
        }
        if errors.len() == 2 {
            println!("First error | use_index_for_page=true: {}", errors[0]);
            println!("Second error | use_index_for_page=false: {}", errors[1]);
            panic!("Reference implementation failed for both methods");
        }
    }
}
