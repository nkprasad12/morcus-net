use crate::{
    bitmask_utils::{Direction, next_one_bit, smear_bitmask},
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, IntermediateResult, QueryExecError,
        index_data::{IndexSlice, apply_and_to_indices},
    },
    profiler::TimeProfiler,
};

impl CorpusQueryEngine {
    /// Computes the page of results for the given parameters.
    pub(super) fn compute_page_result(
        &self,
        match_results: &IntermediateResult,
        page_start: usize,
        page_size: Option<usize>,
        profiler: &mut TimeProfiler,
    ) -> Result<(Vec<u32>, usize), QueryExecError> {
        let page_size = page_size.unwrap_or(10000);
        let matches = match_results.data.data.to_ref();

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
                    id as u32 + match_results.data.range.start
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
    pub(super) fn filter_breaks<'a>(
        &'a self,
        candidates: &IntermediateResult<'a>,
        query_length: usize,
        profiler: &mut TimeProfiler,
    ) -> Result<IntermediateResult<'a>, QueryExecError> {
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

        let hard_breaks = self.get_hard_breaks(candidates.data.range)?;
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
            range: candidates.data.range,
        };
        profiler.phase("Compute break mask");

        // As a future optimization, we can apply the AND in-place on the break mask since we never use it again.
        let (data, position) =
            apply_and_to_indices(&candidates.data, candidates.position, &break_mask, 0)?;

        let match_results = IntermediateResult { data, position };
        profiler.phase("Apply break mask");
        Ok(match_results)
    }
}
