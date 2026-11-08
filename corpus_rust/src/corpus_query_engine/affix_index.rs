//! Wildcard (`con*`, `*que`, `in*bilis`) execution.
//!
//! A wildcard is resolved once, when the query is converted, into the words it
//! matches and their total hits in the corpus (from the vocabulary alone). Its
//! index is then built by merging those words' postings inside the query's
//! `IndexRange`, unless a much smaller sibling lets us check the few candidate
//! tokens' text directly instead.

use std::cell::Cell;
use std::ops::Range;

use crate::corpus_query_engine::index_data::{
    IndexDataOwned, IndexDataRoO, IndexRange, IndexSlice,
};
use crate::corpus_query_engine::{CorpusQueryEngine, IndexData, QueryExecError};
use crate::query_parsing_v2::AffixPattern;

/// Merged hits up to this many become a sorted list; more become a bitmask.
const MAX_LIST_HITS: usize = 4096;
/// A running candidate list this short is checked against a wildcard's text
/// directly when the wildcard has more than `MIN_SPARSE_ANCHOR_AFFIX_HITS`.
const MAX_SPARSE_ANCHOR_CANDIDATES: usize = 256;
const MIN_SPARSE_ANCHOR_AFFIX_HITS: usize = 10_000;
/// The fewest merged wildcard hits the budget allows, however small the corpus.
const MIN_WILDCARD_BUDGET: usize = 250_000;

#[derive(Debug, Clone)]
pub(super) enum WordIds<'a> {
    /// A prefix's words are contiguous.
    Range(Range<u32>),
    /// A suffix's words in `by_suffix`, not yet sorted by word ID.
    Unsorted(&'a [u32]),
    Sorted(Vec<u32>),
}

#[derive(Debug, Clone)]
pub(super) struct AffixPlan<'a> {
    pub pattern: &'a AffixPattern,
    words: WordIds<'a>,
    /// In the whole corpus, like the other atoms' size bounds, whatever the
    /// query's scope.
    pub corpus_hits: usize,
}

/// Caps the postings that wildcards in one query may merge, in total.
pub(super) struct WildcardBudget {
    limit: usize,
    used: Cell<usize>,
}

impl WildcardBudget {
    pub(super) fn new(num_tokens: u32) -> Self {
        WildcardBudget {
            limit: MIN_WILDCARD_BUDGET.max(num_tokens as usize / 25),
            used: Cell::new(0),
        }
    }

    fn remaining(&self) -> usize {
        self.limit.saturating_sub(self.used.get())
    }

    /// `hits` are inside the query's range, since scoping is the advice.
    fn charge(&self, pattern: &AffixPattern, hits: usize) -> Result<(), QueryExecError> {
        if hits > self.limit {
            return Err(QueryExecError::new(&format!(
                "Wildcard '{pattern}' matches too many tokens ({hits}); add more letters or restrict the search to some authors or works"
            )));
        }
        let used = self.used.get() + hits;
        if used > self.limit {
            return Err(QueryExecError::new(&format!(
                "The wildcards in this query match too many tokens together ({used}); add more letters or restrict the search to some authors or works"
            )));
        }
        self.used.set(used);
        Ok(())
    }
}

fn exec_err(e: String) -> QueryExecError {
    QueryExecError::new(&e)
}

fn sorted_list(mut list: Vec<u32>, num_plans: usize) -> IndexDataOwned {
    list.sort_unstable();
    // Different wildcards can match the same word.
    if num_plans > 1 {
        list.dedup();
    }
    IndexDataOwned::List(list)
}

fn empty_bitmask(range: &IndexRange) -> Vec<u64> {
    debug_assert!(range.has_word_bounds());
    vec![0u64; ((range.end - range.start) / 64) as usize]
}

/// Bit `i` of word `w` is token `range.start + 64 * w + i`.
fn set_bits(mask: &mut [u64], range: &IndexRange, postings: &[u32]) {
    for &token in postings {
        let bit = (token - range.start) as usize;
        if let Some(word) = mask.get_mut(bit / 64) {
            *word |= 1 << (bit % 64);
        }
    }
}

/// Whether `token` matches `prefix*suffix`, ignoring ASCII case, with the same
/// no-overlap rule as `SortedVocab::prefix_suffix_ids_sorted`.
fn matches_affix(token: &[u8], prefix: &str, suffix: &str) -> bool {
    token.len() >= prefix.len() + suffix.len()
        && token[..prefix.len()].eq_ignore_ascii_case(prefix.as_bytes())
        && token[token.len() - suffix.len()..].eq_ignore_ascii_case(suffix.as_bytes())
}

impl CorpusQueryEngine {
    fn is_unscoped(&self, range: &IndexRange) -> bool {
        range.start == 0 && range.end >= self.corpus.num_tokens
    }

    /// Calls `f` with every posting of `plan` inside `range`, a slice at a time
    /// (each sorted, but not sorted relative to each other).
    fn for_each_posting_slice(
        &self,
        plan: &AffixPlan,
        range: &IndexRange,
        mut f: impl FnMut(&[u32]),
    ) -> Result<(), QueryExecError> {
        let unscoped = self.is_unscoped(range);
        if let (true, WordIds::Range(ids)) = (unscoped, &plan.words) {
            // One contiguous run of postings, so one read.
            let elements = self
                .vocab
                .prefix_postings_range(ids.clone())
                .ok_or_else(|| QueryExecError::new("Word IDs out of range"))?;
            let postings = self
                .raw_buffers
                .word_postings(self.corpus.word_postings_offset, &elements)
                .map_err(exec_err)?;
            f(postings);
            return Ok(());
        }
        let offsets = self.vocab.postings_offsets();
        let total_elements = 0..offsets.last().copied().unwrap_or(0);
        let all_postings = self
            .raw_buffers
            .word_postings(self.corpus.word_postings_offset, &total_elements)
            .map_err(exec_err)?;
        let mut visit = |id: u32| -> Result<(), QueryExecError> {
            let i = id as usize;
            let (&lo, &hi) = offsets
                .get(i)
                .zip(offsets.get(i + 1))
                .ok_or_else(|| QueryExecError::new("Word ID out of range"))?;
            let postings = all_postings
                .get(lo as usize..hi as usize)
                .ok_or_else(|| QueryExecError::new("Word postings out of bounds"))?;
            if unscoped {
                f(postings);
            } else {
                let start = postings.partition_point(|&t| t < range.start);
                let end = postings.partition_point(|&t| t < range.end);
                f(&postings[start..end]);
            }
            Ok(())
        };
        match &plan.words {
            WordIds::Range(ids) => {
                for id in ids.clone() {
                    visit(id)?;
                }
            }
            WordIds::Unsorted(ids) => {
                // Sort by word ID so the postings are read in address order.
                // Explicit `_mm_prefetch` lookahead was evaluated here and
                // slowed merges down: ascending accesses already trigger the
                // hardware prefetcher, while short posting slices don't
                // amortize the software prefetch instructions.
                let mut sorted = ids.to_vec();
                sorted.sort_unstable();
                for id in sorted {
                    visit(id)?;
                }
            }
            WordIds::Sorted(ids) => {
                for &id in ids {
                    visit(id)?;
                }
            }
        }
        Ok(())
    }

    pub(super) fn plan_affix<'a>(&'a self, pattern: &'a AffixPattern) -> AffixPlan<'a> {
        let words = match pattern {
            AffixPattern::Prefix(p) => WordIds::Range(self.vocab.prefix_range(p)),
            AffixPattern::Suffix(s) => WordIds::Unsorted(self.vocab.suffix_ids_unsorted(s)),
            AffixPattern::PrefixSuffix { prefix, suffix } => {
                WordIds::Sorted(self.vocab.prefix_suffix_ids_sorted(prefix, suffix))
            }
        };
        let corpus_hits = match &words {
            WordIds::Range(ids) => self
                .vocab
                .prefix_postings_range(ids.clone())
                .map_or(0, |r| r.len()),
            WordIds::Unsorted(ids) => self.vocab.sum_postings_len(ids),
            WordIds::Sorted(ids) => self.vocab.sum_postings_len(ids),
        };
        AffixPlan {
            pattern,
            words,
            corpus_hits,
        }
    }

    /// The union of the postings of `plans` inside `range`, or `None` if there
    /// are none. Charges each plan's hits inside `range` to `budget`.
    pub(super) fn merge_affixes<'a>(
        &self,
        plans: &[&AffixPlan],
        range: &'a IndexRange,
        budget: &WildcardBudget,
    ) -> Result<Option<IndexSlice<'a>>, QueryExecError> {
        let corpus_hits: usize = plans.iter().map(|p| p.corpus_hits).sum();
        if corpus_hits == 0 {
            return Ok(None);
        }
        let data = if self.is_unscoped(range) {
            // Every posting is in range, so the counts are known up front.
            for plan in plans {
                budget.charge(plan.pattern, plan.corpus_hits)?;
            }
            if corpus_hits <= MAX_LIST_HITS {
                let mut list = Vec::with_capacity(corpus_hits);
                for plan in plans {
                    self.for_each_posting_slice(plan, range, |postings| {
                        list.extend_from_slice(postings)
                    })?;
                }
                sorted_list(list, plans.len())
            } else {
                let mut mask = empty_bitmask(range);
                for plan in plans {
                    self.for_each_posting_slice(plan, range, |postings| {
                        set_bits(&mut mask, range, postings)
                    })?;
                }
                IndexDataOwned::BitMask(mask)
            }
        } else {
            // One pass per plan, counting its hits in range for the budget.
            // Past the budget, stop copying (the query fails anyway) but keep
            // counting, so the error has the exact count.
            let mut list = Vec::with_capacity(corpus_hits.min(MAX_LIST_HITS));
            for plan in plans {
                let room = budget.remaining();
                let mut hits = 0;
                self.for_each_posting_slice(plan, range, |postings| {
                    hits += postings.len();
                    if hits <= room {
                        list.extend_from_slice(postings);
                    }
                })?;
                budget.charge(plan.pattern, hits)?;
            }
            if list.is_empty() {
                return Ok(None);
            }
            if list.len() <= MAX_LIST_HITS {
                sorted_list(list, plans.len())
            } else {
                let mut mask = empty_bitmask(range);
                set_bits(&mut mask, range, &list);
                IndexDataOwned::BitMask(mask)
            }
        };
        Ok(Some(IndexSlice {
            data: IndexDataRoO::Owned(data),
            range,
            position: 0,
        }))
    }

    /// Whether `plan` should be checked against `data`'s candidates' text
    /// rather than merged: `data` is a short list and the wildcard is huge.
    pub(super) fn use_sparse_anchor(&self, data: &IndexSlice, plan: &AffixPlan) -> bool {
        matches!(data.data.to_ref(), IndexData::List(list) if list.len() <= MAX_SPARSE_ANCHOR_CANDIDATES)
            && plan.corpus_hits > MIN_SPARSE_ANCHOR_AFFIX_HITS
    }

    fn token_matches_affix(
        &self,
        token: u32,
        pattern: &AffixPattern,
    ) -> Result<bool, QueryExecError> {
        let start = self.starts.token_start(token).map_err(exec_err)?;
        let end = self.starts.break_start(token).map_err(exec_err)?;
        let text = self.text.bytes(start, end);
        let (prefix, suffix) = pattern.parts();
        // The vocabulary holds each token's text lowercased, but the pattern is
        // ASCII letters, and no non-ASCII character lowercases to one once the
        // text is NFD-normalized (as `build_corpus.ts` does: only U+0130 and
        // U+212A would, and both decompose), so ignoring ASCII case suffices.
        Ok(matches_affix(text, prefix, suffix))
    }

    /// Keeps the candidates in `data` whose token at `position` (in the same
    /// frame as `data.position`) matches `plan` and lies in `range`, as
    /// intersecting with the merged wildcard would. Keeps `data`'s position.
    pub(super) fn filter_by_affix<'a>(
        &self,
        data: &IndexSlice<'a>,
        plan: &AffixPlan,
        position: u32,
        range: &IndexRange,
    ) -> Result<IndexSlice<'a>, QueryExecError> {
        let IndexData::List(list) = data.data.to_ref() else {
            return Err(QueryExecError::new(
                "Sparse anchor candidates must be a list",
            ));
        };
        let mut kept = Vec::with_capacity(list.len());
        for &candidate in list {
            let Some(token) = candidate
                .checked_add(position)
                .and_then(|t| t.checked_sub(data.position))
            else {
                continue;
            };
            if token < self.corpus.num_tokens
                && (range.start..range.end).contains(&token)
                && self.token_matches_affix(token, plan.pattern)?
            {
                kept.push(candidate);
            }
        }
        Ok(IndexSlice {
            data: IndexDataRoO::Owned(IndexDataOwned::List(kept)),
            range: data.range,
            position: data.position,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_affix_rejects_overlap_and_ignores_case() {
        assert!(matches_affix(b"Arma", "ar", ""));
        assert!(matches_affix(b"virumQUE", "", "que"));
        assert!(matches_affix(b"inbilis", "in", "bilis"));
        assert!(!matches_affix(b"aba", "ab", "ba"));
        assert!(matches_affix(b"abba", "ab", "ba"));
        assert!(!matches_affix(b"qu", "", "que"));
    }

    #[test]
    fn budget_charges_cumulatively() {
        let budget = WildcardBudget::new(0);
        let pattern = AffixPattern::Suffix("que".to_string());
        assert!(budget.charge(&pattern, 200_000).is_ok());
        assert_eq!(budget.remaining(), 50_000);
        let err = budget.charge(&pattern, 60_000).unwrap_err();
        assert!(err.message.contains("together (260000)"), "{}", err.message);
        let err = WildcardBudget::new(0)
            .charge(&pattern, 250_001)
            .unwrap_err();
        assert!(err.message.contains("Wildcard '*que'"), "{}", err.message);
        assert_eq!(WildcardBudget::new(10_000_000).limit, 400_000);
    }

    fn count(slice: &IndexSlice) -> usize {
        slice.data.to_ref().num_elements()
    }

    #[test]
    fn scoped_merge_counts_exact_hits_past_the_budget() {
        let Some(engine) = super::super::reference_impl::get_engine_unsafe() else {
            return;
        };
        let unlimited = WildcardBudget::new(u32::MAX);
        for (author, pattern, kind) in [
            ("Cicero", AffixPattern::Suffix("que".to_string()), "bitmask"),
            ("Caesar", AffixPattern::Prefix("bell".to_string()), "list"),
        ] {
            let (start, end) = engine.resolve_scope_item(author).unwrap();
            let range = IndexRange {
                start: start / 64 * 64,
                end: end.div_ceil(64) * 64,
            };
            let plan = engine.plan_affix(&pattern);
            let merged = engine
                .merge_affixes(&[&plan], &range, &unlimited)
                .unwrap()
                .unwrap();
            let hits = count(&merged);
            assert!(hits > 0 && hits < plan.corpus_hits, "{pattern}");
            let is_list = matches!(merged.data.to_ref(), IndexData::List(_));
            assert_eq!(is_list, kind == "list", "{pattern}");
            let tight = WildcardBudget {
                limit: hits / 2,
                used: Cell::new(0),
            };
            let err = engine.merge_affixes(&[&plan], &range, &tight).unwrap_err();
            assert!(
                err.message.contains(&format!("({hits})")),
                "{}",
                err.message
            );
        }
    }

    /// The text check must agree with the vocabulary for every token.
    #[test]
    fn token_text_matches_agree_with_vocabulary() {
        let Some(engine) = super::super::reference_impl::get_engine_unsafe() else {
            return;
        };
        let num_tokens = engine.corpus.num_tokens;
        let range = IndexRange {
            start: 0,
            end: num_tokens.div_ceil(64) * 64,
        };
        let budget = WildcardBudget::new(u32::MAX);
        for pattern in [
            AffixPattern::Suffix("que".to_string()),
            AffixPattern::Prefix("con".to_string()),
            AffixPattern::PrefixSuffix {
                prefix: "in".to_string(),
                suffix: "bilis".to_string(),
            },
        ] {
            let plan = engine.plan_affix(&pattern);
            let merged = engine
                .merge_affixes(&[&plan], &range, &budget)
                .unwrap()
                .unwrap();
            let contains = |token: u32| match merged.data.to_ref() {
                IndexData::List(list) => list.binary_search(&token).is_ok(),
                IndexData::BitMask(mask) => mask[(token / 64) as usize] & (1 << (token % 64)) != 0,
            };
            for token in (0..num_tokens).step_by(37) {
                assert_eq!(
                    engine.token_matches_affix(token, &pattern).unwrap(),
                    contains(token),
                    "{pattern} at token {token}"
                );
            }
        }
    }
}
