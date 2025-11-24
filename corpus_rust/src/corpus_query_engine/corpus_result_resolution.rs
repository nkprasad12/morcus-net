use std::cmp::{max, min};

use crate::{
    api::{CorpusQueryMatch, CorpusQueryMatchMetadata},
    corpus_query_engine::{
        CorpusQueryEngine, MatchIterator, QueryExecError, corpus_index_calculation::SpanResult,
    },
    query_parsing_v2::QueryRelation,
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

    fn all_combos(&self) -> Vec<Vec<StartAndLength>> {
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
        current_path: &mut Vec<StartAndLength>,
        result: &mut Vec<Vec<StartAndLength>>,
    ) {
        let depth = current_path.len();

        // Add current node to path
        let span_length = self.span_candidates[depth].length as u32;
        current_path.push((node.leader_id, span_length));

        // If we've reached the target depth, save the path
        if current_path.len() == self.span_candidates.len() {
            let mut sorted_path = current_path.clone();
            sorted_path.sort_by_key(|(start, _)| *start);
            result.push(sorted_path);
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

fn compute_offsets(
    leaders: &[(u32, u32)],
    context_len: u32,
    num_tokens: u32,
) -> Result<Vec<(u32, bool)>, QueryExecError> {
    if leaders.is_empty() {
        return Err(QueryExecError::new("No leaders provided"));
    }
    let mut offsets = Vec::with_capacity(leaders.len() + 2);
    // The left context start token. Make sure it doesn't go below 0.
    offsets.push((max(0, leaders[0].0.saturating_sub(context_len)), false));
    for &(start, len) in leaders.iter() {
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
            leaders[leaders.len() - 1].0 + leaders[leaders.len() - 1].1 + context_len - 1,
        ),
        false,
    ));
    Ok(offsets)
}

/// Checks whether any of the given spans overlap.
///
/// # Arguments:
/// * `spans` - A list of (start, length) token ID pairs representing the spans.
///
/// Returns true if any spans overlap, false otherwise.
fn do_spans_overlap(spans: &[StartAndLength]) -> bool {
    if spans.len() < 2 {
        return false;
    }
    let mut spans = spans.to_vec();
    spans.sort_by(|a, b| a.0.cmp(&b.0));
    for i in 0..spans.len() - 1 {
        let (start_i, len_i) = spans[i];
        let end_i = start_i + len_i;
        let (start_j, _) = spans[i + 1];

        // Since spans are sorted, we only need to check if the current span
        // extends into the next span's start
        if start_j < end_i {
            return true;
        }
    }

    false
}

type StartAndLength = (u32, u32);
type SpanLeaders = Vec<StartAndLength>;
pub(super) struct MatchPageResult {
    pub matches: Vec<SpanLeaders>,
    pub skipped_candidates: usize,
}

pub(super) fn get_match_page(
    candidates: &mut MatchIterator<'_>,
    all_span_candidates: &[SpanResult],
    page_size: usize,
) -> Result<MatchPageResult, QueryExecError> {
    let mut skipped_candidates = 0;
    let mut matches = vec![];
    'outer: while matches.len() < page_size {
        let token_id = match candidates.next() {
            Some(token_id) => token_id?,
            None => break,
        };
        let leader_tree = SpanLeaderTree::new(token_id, all_span_candidates)?;
        for possible_leaders in leader_tree.all_combos() {
            // TODO: We should move overlap checks when we're constructing the tree.
            // This way, we can prune entire branches if the first few spans overlap.
            if do_spans_overlap(&possible_leaders) {
                continue;
            }
            matches.push(possible_leaders);
            continue 'outer;
        }
        // None of the leaders matched without overlap.
        skipped_candidates += 1;
    }
    Ok(MatchPageResult {
        matches,
        skipped_candidates,
    })
}

impl CorpusQueryEngine {
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
        let mut metadata: Vec<CorpusQueryMatchMetadata> = Vec::with_capacity(matches.len());
        for match_leaders in &matches {
            let id = match_leaders
                .first()
                .ok_or_else(|| {
                    QueryExecError::new("No span leaders found when building match metadata")
                })?
                .0;
            metadata.push(self.corpus.resolve_match_token(id)?);
        }

        // Read the text chunks.
        let text_parts = starts
            .iter()
            .map(|(byte_offsets, is_core)| {
                let mut chunks = Vec::with_capacity(is_core.len());
                for i in 0..(byte_offsets.len() - 1) {
                    let chunk = self.text.slice(byte_offsets[i], byte_offsets[i + 1]);
                    chunks.push((chunk, is_core[i]));
                }
                chunks
            })
            .collect::<Vec<_>>();

        let matches = metadata
            .into_iter()
            .zip(text_parts)
            .map(|(metadata, text)| CorpusQueryMatch { metadata, text })
            .collect();

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
