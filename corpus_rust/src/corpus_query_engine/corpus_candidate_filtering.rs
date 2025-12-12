use crate::{
    api::PageData,
    bitmask_utils::{Direction, next_one_bit, smear_bitmask},
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, QueryExecError,
        index_data::{IndexSlice, apply_and_to_indices},
    },
    profiler::TimeProfiler,
};

pub(super) struct MatchIterator<'a> {
    /// The candidate to iterate over.
    candidates: IndexData<'a>,
    /// The current index within the candidate data.
    i: usize,
    /// The start token ID for the candidates. For bitmasks, all
    /// IDs are relative to this.
    candidate_start: u32,
    /// The relative offset of the candidate indices.
    candidate_position: u32,
}

impl<'a> MatchIterator<'a> {
    pub(super) fn new(all_candidates: &'a IndexSlice<'a>, page_data: &PageData) -> Self {
        let candidates = all_candidates.data.to_ref();
        // Get to the start of the page.
        let i: usize = match &candidates {
            IndexData::List(_) => page_data.candidate_index as usize,
            IndexData::BitMask(_) => page_data.result_id as usize,
        };
        Self {
            candidate_start: all_candidates.range.start,
            candidates,
            i,
            candidate_position: all_candidates.position,
        }
    }
}

impl<'a> Iterator for MatchIterator<'a> {
    type Item = Result<u32, QueryExecError>;

    fn next(&mut self) -> Option<Self::Item> {
        let token_id = match self.candidates {
            IndexData::List(vec) => {
                if self.i >= vec.len() {
                    return None;
                }
                let id = vec[self.i];
                self.i += 1;
                id
            }
            IndexData::BitMask(bitmask) => match next_one_bit(bitmask, self.i) {
                Some(v) => {
                    self.i = v + 1;
                    v as u32 + self.candidate_start
                }
                None => return None,
            },
        };
        if token_id < self.candidate_position {
            return Some(Err(QueryExecError::new(
                "Token ID is less than candidate position",
            )));
        }
        Some(Ok(token_id - self.candidate_position))
    }
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
