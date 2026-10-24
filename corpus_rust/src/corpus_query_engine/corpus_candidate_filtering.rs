use crate::{
    api::PageData,
    bitmask_utils::{Direction, apply_and_not_with_bitmasks, next_one_bit, smear_bitmask},
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, QueryExecError,
        index_data::{IndexDataOwned, IndexSlice},
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
        // Conceptually, we compute a break mask, which is the negation of the hard breaks
        // smeared left, and AND the candidates with it.
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
        //
        // In practice we avoid materialising the negated mask:
        // - List candidates probe the hard breaks directly (1-2 words each).
        // - Bitmask candidates use an and-not kernel against the (smeared) breaks.

        let hard_breaks = self.get_hard_breaks(candidates.range)?;
        let (data, position) = match candidates.data.to_ref() {
            IndexData::List(list) => {
                let matches = filter_list_breaks(
                    list,
                    candidates.position,
                    hard_breaks,
                    candidates.range.start,
                    query_length,
                )?;
                profiler.phase("Apply break mask");
                // Results are span starts, so they are no longer offset.
                (IndexDataOwned::List(matches), 0)
            }
            IndexData::BitMask(bitmask) => {
                let offset = candidates.position as isize;
                let matches = if query_length == 2 {
                    apply_and_not_with_bitmasks(bitmask, hard_breaks, offset)
                } else {
                    let smeared = smear_bitmask(hard_breaks, query_length - 2, Direction::Left);
                    profiler.phase("Compute break mask");
                    apply_and_not_with_bitmasks(bitmask, &smeared, offset)
                };
                profiler.phase("Apply break mask");
                (IndexDataOwned::BitMask(matches), candidates.position)
            }
        };
        Ok(IndexSlice {
            data: IndexDataRoO::Owned(data),
            range: candidates.range,
            position,
        })
    }
}

/// Keeps the List candidates whose span `s ..= s + query_length - 1` has no hard break
/// between its tokens, i.e. hard-break bits `s ..= s + query_length - 2` are all zero.
///
/// Candidate `v` corresponds to span start `s = v - position`. Bits of `hard_breaks`
/// are relative to `range_start`; candidates whose span start falls outside the mask are
/// dropped, and bits past the end of the mask are treated as "no break". This exactly
/// mirrors ANDing with the negated, left-smeared break mask.
///
/// Returns the surviving span starts (i.e. with position 0).
fn filter_list_breaks(
    list: &[u32],
    position: u32,
    hard_breaks: &[u64],
    range_start: u32,
    query_length: usize,
) -> Result<Vec<u32>, QueryExecError> {
    // Number of break bits to check per candidate.
    let window = query_length - 1;
    if window == 0 || window >= 64 {
        return Err(QueryExecError::new(
            "Unsupported query length for break filtering",
        ));
    }
    let window_mask = (1u64 << window) - 1;
    let first_valid = range_start as u64 + position as u64;
    let end = first_valid + hard_breaks.len() as u64 * 64;

    let mut results = Vec::with_capacity(list.len());
    for &v in list {
        let v = v as u64;
        if v < first_valid {
            continue;
        }
        if v >= end {
            break;
        }
        let rel = (v - first_valid) as usize;
        let (word, bit) = (rel / 64, rel % 64);
        let mut bits = hard_breaks[word] >> bit;
        // `window < 64`, so this can only happen when `bit > 0`.
        if bit + window > 64
            && let Some(&next) = hard_breaks.get(word + 1)
        {
            bits |= next << (64 - bit);
        }
        if bits & window_mask == 0 {
            results.push((v - position as u64) as u32);
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bitmask_utils::to_bitmask;

    /// The original formulation: negate the smeared breaks and check bit `s`.
    fn naive(
        list: &[u32],
        position: u32,
        breaks: &[u64],
        range_start: u32,
        query_length: usize,
    ) -> Vec<u32> {
        let n = breaks.len() as u64 * 64;
        let is_break = |i: u64| i < n && (breaks[(i / 64) as usize] >> (i % 64)) & 1 == 1;
        list.iter()
            .filter_map(|&v| {
                let s = v as i64 - position as i64 - range_start as i64;
                if s < 0 || s as u64 >= n {
                    return None;
                }
                let s = s as u64;
                let ok = (s..s + query_length as u64 - 1).all(|i| !is_break(i));
                ok.then_some(v - position)
            })
            .collect()
    }

    #[test]
    fn filter_list_breaks_handles_word_boundaries() {
        // Break after token 63: spans starting at 62 (len 3) and 63 (len 2) cross it.
        let breaks = to_bitmask(&[63], 128);
        let list: Vec<u32> = (0..128).collect();
        for len in 2..=5 {
            assert_eq!(
                filter_list_breaks(&list, 0, &breaks, 0, len).unwrap(),
                naive(&list, 0, &breaks, 0, len),
                "len={len}"
            );
        }
        let r = filter_list_breaks(&list, 0, &breaks, 0, 2).unwrap();
        assert!(!r.contains(&63));
        assert!(r.contains(&62) && r.contains(&64));
        let r = filter_list_breaks(&list, 0, &breaks, 0, 3).unwrap();
        assert!(!r.contains(&62) && !r.contains(&63));
        assert!(r.contains(&61));
    }

    #[test]
    fn filter_list_breaks_matches_naive() {
        let mut state = 0x2545F4914F6CDD1Du64;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        let range_start = 128;
        for _ in 0..20 {
            let breaks: Vec<u64> = (0..4).map(|_| next() & next()).collect();
            let list: Vec<u32> = (0..512u32).filter(|_| next() % 3 == 0).collect();
            for position in [0u32, 1, 2, 5] {
                for len in [2usize, 3, 4, 9, 17] {
                    assert_eq!(
                        filter_list_breaks(&list, position, &breaks, range_start, len).unwrap(),
                        naive(&list, position, &breaks, range_start, len),
                        "position={position} len={len}"
                    );
                }
            }
        }
    }
}
