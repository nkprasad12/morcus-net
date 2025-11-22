use crate::{
    api::PageData,
    bitmask_utils::{Direction, next_one_bit, smear_bitmask},
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, QueryExecError,
        index_data::{IndexSlice, apply_and_to_indices},
    },
    profiler::TimeProfiler,
};

/// Computes the page of results for the given parameters.
pub(super) fn compute_page_result(
    match_results: &IndexSlice,
    page_data: &PageData,
    page_size: usize,
) -> Result<(Vec<u32>, usize, Option<PageData>), QueryExecError> {
    let matches = match_results.data.to_ref();

    // Get to the start of the page.
    let mut results: Vec<u32> = vec![];
    let mut i: usize = match &matches {
        IndexData::List(_) => page_data.candidate_index as usize,
        IndexData::BitMask(_) => page_data.result_id as usize,
    };

    let n = matches.num_elements();
    let mut next_start = None;
    while results.len() < page_size + 1 {
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
                id as u32 + match_results.range.start
            }
        };

        if token_id < match_results.position {
            return Err(QueryExecError::new("Token ID is less than match position"));
        }
        if results.len() == page_size {
            next_start = Some(PageData {
                result_index: page_data.result_index + results.len() as u32,
                // TODO: This is the same as the `result_index` for now because we never
                // skip candidates, but when we implement fuzzy matches and do need to
                // discard candidates, this will need to be updated.
                candidate_index: page_data.result_index + results.len() as u32,
                result_id: token_id - match_results.position,
            });
            break;
        }
        results.push(token_id - match_results.position);
    }
    Ok((results, n, next_start))
}

impl CorpusQueryEngine {
    /// Filters a list of candidates into just the actual matches.
    pub(super) fn filter_breaks<'a>(
        &'a self,
        candidates: &IndexSlice<'a>,
        query_length: usize,
        profiler: &mut TimeProfiler,
    ) -> Result<IndexSlice<'a>, QueryExecError> {
        // There can be no hard breaks between tokens without multiple tokens.
        if query_length < 2 {
            return Err(QueryExecError::new(
                "Query length must be at least 2 to filter breaks",
            ));
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

        let hard_breaks = self.get_hard_breaks(candidates.range)?;
        let break_mask = if query_length == 2 {
            hard_breaks.iter().map(|x| !*x).collect::<Vec<_>>()
        } else {
            let mut smeared = smear_bitmask(hard_breaks, query_length - 2, Direction::Left);
            for elem in &mut smeared {
                *elem = !*elem;
            }
            smeared
        };
        let break_mask = IndexSlice {
            data: IndexDataRoO::Ref(IndexData::BitMask(break_mask.as_slice())),
            range: candidates.range,
            position: 0,
        };
        profiler.phase("Compute break mask");

        // As a future optimization, we can apply the AND in-place on the break mask since we never use it again.
        let match_results = apply_and_to_indices(candidates, &break_mask)?;
        profiler.phase("Apply break mask");
        Ok(match_results)
    }
}
