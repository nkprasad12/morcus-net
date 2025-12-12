use std::{
    cmp::{max, min},
    collections::HashMap,
};

use crate::{
    analyzer_types::LatinInflection,
    api::{CorpusQueryMatch, CorpusQueryMatchMetadata, PageData, QueryGlobalInfo},
    corpus_query_engine::{
        CorpusQueryEngine, MatchIterator, QueryExecError,
        corpus_data_readers::LemmaAndInflection,
        corpus_index_calculation::SpanResult,
        corpus_query_conversion::InternalQueryTerm,
        query_validation::{atoms_in, operators_in},
    },
    query_parsing_v2::{QueryRelation, TokenConstraintAtom, TokenConstraintOperation},
};

/// Finds the leader of the span with the given anchor ID.
///
/// # Arguments
/// * `anchor_id` - The token ID of the anchor. This is position-normalized (i.e., has a position of 0).
/// * `span` - The span to find the leader for.
///
/// Returns the possible token IDs of the span leader, position-normalized.
fn find_span_leader(anchor_id: u32, span: &SpanResult) -> Result<Vec<u32>, QueryExecError> {
    if span.length == 0 {
        return Err(QueryExecError::new("Empty query span found"));
    }
    let (proximity_len, is_directed) = match span.relation {
        QueryRelation::Proximity {
            distance,
            is_directed,
        } => (distance as u32, is_directed),
        _ => {
            return Err(QueryExecError::new("`First` found for non-initial span"));
        }
    };

    let subtractand = if is_directed { 0 } else { proximity_len };
    let anchor_start = anchor_id.saturating_sub(subtractand);
    // +1 because the end is exclusive.
    let anchor_end = anchor_id + proximity_len + 1;
    let (span_start, span_end) = span.candidates.normalized_range();
    if anchor_end <= span_start || span_end <= anchor_start {
        // There's no overlap in the ranges.
        return Err(QueryExecError::new("No span leader found within proximity"));
    }
    let start = max(anchor_start, span_start) + span.candidates.position;
    let end = min(anchor_end, span_end) + span.candidates.position;

    match span.candidates.data.to_ref() {
        super::IndexData::BitMask(mask) => {
            let start_bit = start.saturating_sub(span.candidates.range.start);
            let end_bit = end.saturating_sub(span.candidates.range.start);
            if end_bit <= span.candidates.position {
                // We won't have any candidates possible, because any candidate bit would
                // be negative after applying the position offset.
                return Err(QueryExecError::new(
                    "No span leader found within proximity [for bitmask].",
                ));
            }
            // Skip bits before the position offset.
            let start_bit = max(start_bit, span.candidates.position);

            let mut matches = Vec::new();
            for bit in start_bit..end_bit {
                if (mask[(bit / 64) as usize] & (1u64 << (bit % 64))) != 0 {
                    matches.push(span.candidates.range.start + bit - span.candidates.position);
                }
            }
            Ok(matches)
        }
        super::IndexData::List(list) => {
            let i = list.partition_point(|x| *x < start);
            let j = list.partition_point(|x| *x < end);
            if i >= j {
                return Err(QueryExecError::new(
                    "No span leader found within proximity [for list].",
                ));
            }

            Ok(list[i..j]
                .iter()
                .filter(|&&x| x >= span.candidates.position)
                .map(|&x| x - span.candidates.position)
                .collect())
        }
    }
}

/// A tree of possible span leaders. Each span can have multiple
/// possible valid token IDs for its leader relative to the last anchor.
struct SpanLeaderTree<'a> {
    span_candidates: &'a [SpanResult<'a>],
    root: SpanLeaderNode,
}

/// The sorted, and the original order of the spans.
type SortedStartsAndSpans<'a> = (Vec<StartAndSpan<'a>>, Vec<StartAndSpan<'a>>);

impl<'a> SpanLeaderTree<'a> {
    fn new(
        anchor_id: u32,
        all_span_candidates: &'a [SpanResult<'a>],
    ) -> Result<Self, QueryExecError> {
        let root = span_tree_rooted_at(anchor_id, all_span_candidates)?;
        Ok(SpanLeaderTree {
            span_candidates: all_span_candidates,
            root,
        })
    }

    fn find_leaders(&self) -> Vec<SortedStartsAndSpans<'a>> {
        if self.span_candidates.is_empty() {
            return vec![];
        }

        let mut result = Vec::new();
        let mut current_path = Vec::with_capacity(self.span_candidates.len());
        self.collect_paths(&self.root, &mut current_path, &mut result);
        result
    }

    fn collect_paths(
        &self,
        node: &SpanLeaderNode,
        current_path: &mut Vec<StartAndSpan<'a>>,
        result: &mut Vec<SortedStartsAndSpans<'a>>,
    ) {
        let depth = current_path.len();

        // Add current node to path
        current_path.push((node.leader_id, &self.span_candidates[depth]));

        // If we've reached the target depth, save the path
        if current_path.len() == self.span_candidates.len() {
            let mut sorted_path = current_path.clone();
            sorted_path.sort_by_key(|(start, _)| *start);
            // TODO: We should move overlap checks when we're constructing the tree.
            // This way, we can prune entire branches if the first few spans overlap.
            if !do_spans_overlap(&sorted_path) {
                result.push((sorted_path.clone(), current_path.clone()));
            }
        } else {
            // Otherwise, recurse on children
            for child in &node.children {
                self.collect_paths(child, current_path, result);
            }
        }

        // Backtrack
        current_path.pop();
    }
}

#[derive(Default)]
struct SpanLeaderNode {
    leader_id: u32,
    children: Vec<SpanLeaderNode>,
}

fn span_tree_rooted_at(
    token_id: u32,
    all_span_candidates: &[SpanResult],
) -> Result<SpanLeaderNode, QueryExecError> {
    if all_span_candidates.is_empty() {
        return Err(QueryExecError::new("No query spans provided"));
    }
    // A list of (leader ID, index of child nodes in `all_nodes`)
    let mut raw_nodes: Vec<(u32, Vec<usize>)> = vec![(token_id, vec![])];
    let mut queue = vec![0];

    for span in all_span_candidates.iter().skip(1) {
        let mut new_queue = vec![];
        for i in queue.drain(..) {
            let leader_id = raw_nodes[i].0;
            // Find the possible leaders for this span that are close
            // to the last span's leader.
            for span_leader in find_span_leader(leader_id, span)? {
                let id = raw_nodes.len();
                raw_nodes.push((span_leader, vec![]));
                raw_nodes[i].1.push(id);
                new_queue.push(id);
            }
        }
        queue = new_queue;
    }

    // Now, reconstruct the tree from the raw nodes.
    let mut nodes = Vec::<SpanLeaderNode>::with_capacity(raw_nodes.len());
    for (leader_id, children_indices) in raw_nodes.iter().rev() {
        let mut node = SpanLeaderNode {
            leader_id: *leader_id,
            children: Vec::with_capacity(children_indices.len()),
        };
        for &child_idx in children_indices {
            // Since we're iterating backwards, the `i`th raw node is mapped to the
            // `(len - 1 - i)`th constructed node.
            // Because we do a BFS above, we know the nodes at the end of the tree are the leaves,
            // the nodes before that are parents of leaves, and so on.
            let i = raw_nodes.len() - 1 - child_idx;
            node.children.push(std::mem::take(&mut nodes[i]));
        }
        nodes.push(node);
    }

    let root = nodes
        .pop()
        .ok_or(QueryExecError::new("Invalid number of nodes."))?;
    Ok(root)
}

fn compute_offsets<'a>(
    leaders: &[StartAndSpan<'a>],
    context_len: u32,
    num_tokens: u32,
) -> Result<Vec<(u32, bool)>, QueryExecError> {
    if leaders.is_empty() {
        return Err(QueryExecError::new("No leaders provided"));
    }
    let mut offsets = Vec::with_capacity(leaders.len() + 2);
    // The left context start token. Make sure it doesn't go below 0.
    offsets.push((max(0, leaders[0].0.saturating_sub(context_len)), false));
    for &(start, span) in leaders.iter() {
        let len = span.length as u32;
        // Make sure this is updated if we don't add an offset for the left context above;
        // otherwise, this would panic.
        if start != 0 && start <= offsets[offsets.len() - 1].0 {
            return Err(QueryExecError::new("Overlapping spans found"));
        }
        if start == 0 {
            if offsets.len() > 1 {
                return Err(QueryExecError::new("Multiple spans starting at 0"));
            }
            offsets[0].1 = true;
            offsets.push((len - 1, false));
            continue;
        }
        offsets.push((start, true));
        offsets.push((start + len - 1, false));
    }
    // The right context end token. Make sure it doesn't go beyond the number of tokens.
    offsets.push((
        min(
            num_tokens - 1,
            leaders[leaders.len() - 1].0 + leaders[leaders.len() - 1].1.length as u32 + context_len
                - 1,
        ),
        false,
    ));
    Ok(offsets)
}

/// Checks whether any of the given spans overlap.
///
/// # Arguments:
/// * `spans` - A list of (start, span) token ID pairs representing the spans.
///
/// Returns true if any spans overlap, false otherwise.
fn do_spans_overlap(spans: &[StartAndSpan]) -> bool {
    if spans.len() < 2 {
        return false;
    }
    let mut spans = spans.to_vec();
    spans.sort_by(|a, b| a.0.cmp(&b.0));
    for i in 0..spans.len() - 1 {
        let (start_i, span) = spans[i];
        let end_i = start_i + span.length as u32;
        let (start_j, _) = spans[i + 1];

        // Since spans are sorted, we only need to check if the current span
        // extends into the next span's start
        if start_j < end_i {
            return true;
        }
    }

    false
}

fn find_leaders_for<'a>(
    token_id: u32,
    all_span_candidates: &'a [SpanResult],
) -> Result<Vec<SortedStartsAndSpans<'a>>, QueryExecError> {
    let tree = SpanLeaderTree::new(token_id, all_span_candidates)?;
    Ok(tree.find_leaders())
}

fn get_result_stats(
    total_candidates: usize,
    results_in_page: usize,
    current_page: &PageData,
    next_page: &Option<PageData>,
) -> QueryGlobalInfo {
    let next_page = match next_page {
        None => {
            return QueryGlobalInfo {
                // Since there's no next page, this is exact.
                estimated_results: current_page.result_index as usize + results_in_page,
            };
        }
        Some(v) => v,
    };
    let hit_rate = next_page.result_index as f64 / next_page.candidate_index as f64;
    let remaining_candidates = total_candidates.saturating_sub(next_page.candidate_index as usize);
    let estimated_remaining_results =
        (remaining_candidates as f64 * hit_rate + 0.99).floor() as usize;
    QueryGlobalInfo {
        estimated_results: next_page.result_index as usize + estimated_remaining_results,
    }
}

type InflectionMask = u32;
struct TokenValidationInfo2 {
    span_idx: usize,
    term_idx: usize,
    inflection: InflectionMask,
    lemmata: Vec<u32>,
}

// function packWordInflectionDataForCorpus(data: WordInflectionData): number {
//   let mask = 0;
//   mask = setInflectionField(mask, 0, data.case);
//   mask = setInflectionField(mask, 7, data.number); // 7 cases
//   mask = setInflectionField(mask, 9, data.gender); // 2 numbers
//   mask = setInflectionField(mask, 13, data.person); // 4 genders
//   mask = setInflectionField(mask, 16, data.mood); // 3 persons
//   mask = setInflectionField(mask, 23, data.voice); // 7 moods
//   mask = setInflectionField(mask, 25, data.tense); // 2 voices
//   return mask;
// }

/// Within the spans, find the positions that need inflection validation.
fn positions_needing_validation<'a>(
    spans: &'a [&[InternalQueryTerm]],
    id_table: &'a HashMap<String, HashMap<String, u32>>,
) -> Result<Vec<TokenValidationInfo2>, String> {
    let mut positions = vec![];
    for (span_idx, span) in spans.iter().enumerate() {
        for (term_idx, term) in span.iter().enumerate() {
            let ops = operators_in(term.constraint.inner);
            if !ops.contains(&TokenConstraintOperation::And) {
                continue;
            }
            let atoms = atoms_in(term.constraint.inner);
            let mut inflection_mask = 0;
            let mut inflection_constraints = 0;
            let mut lemmata = vec![];
            for atom in atoms {
                match atom {
                    TokenConstraintAtom::Lemma(lemma) => {
                        let id = id_table
                            .get("lemma")
                            .and_then(|m| m.get(lemma))
                            .ok_or("Could not find lemma")?;
                        lemmata.push(*id);
                    }
                    TokenConstraintAtom::Inflection(inflection) => {
                        inflection_constraints += 1;
                        let start = match inflection {
                            LatinInflection::Case(_) => 0,
                            LatinInflection::Number(_) => 7,
                            LatinInflection::Gender(_) => 9,
                            LatinInflection::Person(_) => 13,
                            LatinInflection::Mood(_) => 16,
                            LatinInflection::Voice(_) => 23,
                            LatinInflection::Tense(_) => 25,
                            LatinInflection::Degree(_) => {
                                return Err(
                                    "Degree inflection not supported for validation".to_string()
                                );
                            }
                        };
                        // -1 because it is 1-based in the LatinInflection enum.
                        let bit = start + inflection.get_code() - 1;
                        inflection_mask |= 1 << bit;
                    }
                    _ => {}
                }
            }
            if (lemmata.len() + inflection_constraints) > 1 {
                positions.push(TokenValidationInfo2 {
                    span_idx,
                    term_idx,
                    inflection: inflection_mask,
                    lemmata,
                });
            }
        }
    }
    Ok(positions)
}

/// Checks whether the given inflection restrictions all match the given inflection data.
fn does_inflection_match_all(
    lemma_and_inflection: LemmaAndInflection,
    constraints: &TokenValidationInfo2,
) -> bool {
    let observed_bits = lemma_and_inflection as u32;
    if observed_bits & constraints.inflection != constraints.inflection {
        return false;
    }
    let observed_lemma = (lemma_and_inflection >> 32) as u32;
    for expected_lemma in &constraints.lemmata {
        if observed_lemma != *expected_lemma {
            return false;
        }
    }
    true
}

type StartAndSpan<'a> = (u32, &'a SpanResult<'a>);
type SpanLeaders<'a> = Vec<StartAndSpan<'a>>;
pub(super) struct MatchPageResult<'a> {
    pub matches: Vec<SpanLeaders<'a>>,
    pub next_page: Option<PageData>,
    pub summary_info: QueryGlobalInfo,
}

#[inline]
fn within_work_bounds(sorted_span_leaders: &[(u32, &SpanResult<'_>)], work_bounds: &[u32]) -> bool {
    if sorted_span_leaders.len() < 2 {
        return true;
    }

    let start = sorted_span_leaders[0].0;
    let start_work = work_bounds
        .binary_search(&start)
        .unwrap_or_else(|i| i.saturating_sub(1));

    let last_span = sorted_span_leaders[sorted_span_leaders.len() - 1];
    let end = last_span.0 + last_span.1.length as u32 - 1;

    // Make sure that the end is within the same work as the start.
    work_bounds[start_work] < end && end < *work_bounds.get(start_work + 1).unwrap_or(&u32::MAX)
}

#[inline]
fn has_matching_inflections(
    unsorted_leaders: &[(u32, &SpanResult)],
    needs_validation: &[TokenValidationInfo2],
    corpus: &CorpusQueryEngine,
) -> Result<bool, String> {
    // For any words that need inflection validation, check that at least one possible inflection analysis
    // matches the required restrictions.
    for token_data in needs_validation {
        // For now, for simplicity, just assume it's an AND for everything.
        let token_to_check = unsorted_leaders[token_data.span_idx].0 + (token_data.term_idx as u32);
        let inflection_options = corpus.inflections.get_inflection_data(token_to_check)?;
        if !inflection_options
            .iter()
            // The lower 32 bits are the inflection data.
            .any(|data| does_inflection_match_all(*data, token_data))
        {
            // ALL of the tokens that need validation need to validate, otherwise it's not
            // a match.
            return Ok(false);
        }
    }
    Ok(true)
}

#[inline]
fn leaders_for_candidate<'a>(
    token_id: u32,
    all_span_candidates: &'a [SpanResult],
    work_bounds: &[u32],
    needs_validation: &[TokenValidationInfo2],
    corpus: &CorpusQueryEngine,
    last_match: Option<&Vec<StartAndSpan<'a>>>,
) -> Result<Option<Vec<StartAndSpan<'a>>>, QueryExecError> {
    for (sorted, unsorted) in find_leaders_for(token_id, all_span_candidates)? {
        if let Some(last_match) = last_match {
            if sorted.len() != last_match.len() {
                return Err(QueryExecError::new(
                    "Inconsistent number of spans in match results.",
                ));
            }
            let is_duplicate = last_match
                .iter()
                .zip(sorted.iter())
                .all(|(a, b)| a.0 == b.0);
            if is_duplicate {
                continue;
            }
        }
        if !within_work_bounds(&sorted, work_bounds) {
            // We have spans that cross work boundaries.
            continue;
        }
        if !has_matching_inflections(&unsorted, needs_validation, corpus)? {
            // We have inflections constraints that don't match one singular analysis.
            continue;
        }
        return Ok(Some(sorted));
    }
    Ok(None)
}

pub(super) fn get_match_page<'a>(
    candidates: &mut MatchIterator<'_>,
    all_span_candidates: &'a [SpanResult],
    query_spans: &[&[InternalQueryTerm]],
    corpus: &CorpusQueryEngine,
    page_size: usize,
    current_page: &PageData,
    total_candidates: usize,
) -> Result<MatchPageResult<'a>, QueryExecError> {
    let work_bounds = corpus
        .corpus
        .work_lookup
        .iter()
        .map(|w| w.rows[0].1)
        .collect::<Vec<u32>>();
    let needs_validation = positions_needing_validation(query_spans, &corpus.corpus.id_table)?;

    let mut matches = vec![];
    let mut skipped_candidates = 0;

    while matches.len() < page_size {
        let token_id = match candidates.next() {
            None => break,
            Some(t) => t?,
        };
        let leaders = leaders_for_candidate(
            token_id,
            all_span_candidates,
            &work_bounds,
            &needs_validation,
            corpus,
            matches.last(),
        )?;
        match leaders {
            None => skipped_candidates += 1,
            Some(v) => matches.push(v),
        }
    }
    // Figure out if there's a next page
    let mut next_page = None;
    loop {
        let token_id = match candidates.next() {
            None => break,
            Some(t) => t?,
        };
        let leaders = leaders_for_candidate(
            token_id,
            all_span_candidates,
            &work_bounds,
            &needs_validation,
            corpus,
            matches.last(),
        )?;
        if leaders.is_none() {
            skipped_candidates += 1;
            continue;
        }
        next_page = Some(PageData {
            result_index: current_page.result_index + page_size as u32,
            candidate_index: current_page.candidate_index
                + page_size as u32
                + skipped_candidates as u32,
            result_id: token_id,
        });
        break;
    }

    let summary_info = get_result_stats(total_candidates, matches.len(), current_page, &next_page);
    Ok(MatchPageResult {
        matches,
        next_page,
        summary_info,
    })
}

impl CorpusQueryEngine {
    #[inline]
    fn resolve_text_ranges(
        &self,
        mut byte_offsets: Vec<usize>,
        is_core: Vec<bool>,
        metadata: &CorpusQueryMatchMetadata,
    ) -> Result<Vec<(String, bool)>, QueryExecError> {
        let work_start_byte = self.starts.token_start(metadata.work_start_token)?;
        let mut i = 0;
        while byte_offsets[i] < work_start_byte && i < byte_offsets.len() {
            if i + 1 < byte_offsets.len() && byte_offsets[i + 1] > work_start_byte {
                // Truncate this chunk to the work start if the next chunk starts after it.
                byte_offsets[i] = work_start_byte;
                break;
            }
            i += 1;
        }

        // The end is exclusive, which could cause a problem if we have the end of the very last work.
        // So instead of byte position of the `work_end_token`th token, we use the byte position of the
        // `(work_end_token - 1)`th break (which occurrs after the token).
        // Note that this would trim the final punctuation after the last token, but that's acceptable for now.
        let work_end_byte = self.starts.break_start(metadata.work_end_token - 1)?;
        let mut j = byte_offsets.len() - 1;
        while byte_offsets[j] > work_end_byte {
            if j > 0 && byte_offsets[j - 1] < work_end_byte {
                // Truncate this chunk to the work end if the previous chunk ends before it.
                byte_offsets[j] = work_end_byte;
                break;
            }
            j -= 1;
        }

        if i >= j {
            return Err("No text chunks found!".to_string().into());
        }

        // Read the text chunks.
        let mut text_chunks = Vec::with_capacity(j - i);
        for k in i..j {
            let chunk = self.text.slice(byte_offsets[k], byte_offsets[k + 1]);
            text_chunks.push((chunk, is_core[k]));
        }
        Ok(text_chunks)
    }

    pub(super) fn resolve_match_tokens(
        &self,
        matches: Vec<SpanLeaders>,
        context_len: u32,
    ) -> Result<Vec<CorpusQueryMatch<'_>>, QueryExecError> {
        if matches.is_empty() {
            return Ok(vec![]);
        }

        let mut starts: Vec<(Vec<usize>, Vec<bool>)> = Vec::with_capacity(matches.len());
        for match_leaders in &matches {
            let span_ranges = compute_offsets(match_leaders, context_len, self.corpus.num_tokens)?;
            let mut offsets: Vec<usize> = Vec::with_capacity(span_ranges.len());
            let mut is_core_match: Vec<bool> = Vec::with_capacity(span_ranges.len());
            for (i, (token_offset, is_core)) in span_ranges.iter().enumerate() {
                let byte_offset = if i == 0 || *is_core {
                    self.starts.token_start(*token_offset)?
                } else {
                    self.starts.break_start(*token_offset)?
                };
                offsets.push(byte_offset);
                is_core_match.push(*is_core);
            }
            starts.push((offsets, is_core_match));
        }

        // Warm up the ranges that we're about to access.
        let start = starts[0].0[0];
        let end = match starts[starts.len() - 1].0.last() {
            Some(v) => *v,
            None => return Err(QueryExecError::new("No end offset found")),
        };
        self.text.advise_range(start, end);

        // Compute the metadata while the OS is (hopefully) loading the pages into memory.
        let mut all_metadata: Vec<CorpusQueryMatchMetadata> = Vec::with_capacity(matches.len());
        for match_leaders in &matches {
            all_metadata.push(
                self.corpus.resolve_match_token(
                    match_leaders
                        .iter()
                        .map(|(id, span)| (*id, span.length))
                        .collect(),
                )?,
            );
        }

        let matches = starts
            .into_iter()
            .zip(all_metadata)
            .map(|((byte_offsets, is_core), metadata)| {
                let text = self.resolve_text_ranges(byte_offsets, is_core, &metadata)?;
                Ok(CorpusQueryMatch { metadata, text })
            })
            .collect::<Result<Vec<_>, QueryExecError>>()?;

        Ok(matches)
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        bitmask_utils::to_bitmask,
        corpus_query_engine::{
            IndexDataRoO,
            corpus_index_calculation::SpanResult,
            corpus_result_resolution::find_span_leader,
            index_data::{IndexDataOwned, IndexRange, IndexSlice},
        },
        query_parsing_v2::QueryRelation,
    };

    #[test]
    fn test_find_span_leader_list_no_position_offset() {
        let range = &IndexRange { start: 0, end: 63 };
        let data = IndexDataRoO::Owned(IndexDataOwned::List(vec![4, 15, 21, 23]));
        let position = 0;
        let candidates = IndexSlice {
            data,
            range,
            position,
        };
        let span_result = SpanResult {
            candidates,
            length: 3,
            relation: QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            },
        };

        let leader = find_span_leader(27, &span_result);

        assert_eq!(leader.unwrap(), vec![23]);
    }

    #[test]
    fn test_find_span_leader_bitmask_no_position_offset() {
        let range = &IndexRange { start: 0, end: 63 };
        let list = vec![4, 15, 21, 23];
        let bitmask = to_bitmask(&list, 64);
        let data = IndexDataRoO::Owned(IndexDataOwned::BitMask(bitmask));
        let position = 0;
        let candidates = IndexSlice {
            data,
            range,
            position,
        };
        let span_result = SpanResult {
            candidates,
            length: 3,
            relation: QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            },
        };

        let leader = find_span_leader(27, &span_result);

        assert_eq!(leader.unwrap(), vec![23]);
    }

    #[test]
    fn test_find_span_leader_bitmask_multiple_options() {
        let range = &IndexRange { start: 0, end: 63 };
        let list = vec![4, 15, 21, 23, 31];
        let bitmask = to_bitmask(&list, 64);
        let data = IndexDataRoO::Owned(IndexDataOwned::BitMask(bitmask));
        let position = 0;
        let candidates = IndexSlice {
            data,
            range,
            position,
        };
        let span_result = SpanResult {
            candidates,
            length: 3,
            relation: QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            },
        };

        let leader = find_span_leader(27, &span_result);

        assert_eq!(leader.unwrap(), vec![23, 31]);
    }

    #[test]
    fn test_find_span_leader_list_with_position_offset() {
        let range = &IndexRange { start: 0, end: 63 };
        let data = IndexDataRoO::Owned(IndexDataOwned::List(vec![4, 15, 20, 23]));
        let position = 2;
        let candidates = IndexSlice {
            data,
            range,
            position,
        };
        let span_result = SpanResult {
            candidates,
            length: 3,
            relation: QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            },
        };

        let leader = find_span_leader(25, &span_result);

        assert_eq!(leader.unwrap(), vec![21]);
    }

    #[test]
    fn test_find_span_leader_list_multiple_options() {
        let range = &IndexRange { start: 0, end: 63 };
        let data = IndexDataRoO::Owned(IndexDataOwned::List(vec![4, 15, 20, 23, 31]));
        let position = 2;
        let candidates = IndexSlice {
            data,
            range,
            position,
        };
        let span_result = SpanResult {
            candidates,
            length: 3,
            relation: QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            },
        };

        let leader = find_span_leader(25, &span_result);

        assert_eq!(leader.unwrap(), vec![21, 29]);
    }
}
