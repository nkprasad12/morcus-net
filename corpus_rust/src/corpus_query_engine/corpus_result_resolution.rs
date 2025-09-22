use std::cmp::{max, min};

use crate::{
    corpus_query_engine::{
        CorpusQueryEngine, CorpusQueryMatch, CorpusQueryMatchMetadata, QueryExecError,
        corpus_query_conversion::InternalQueryTerm,
    },
    query_parsing_v2::QueryRelation,
};

fn find_span_leaders(
    token_id: u32,
    query_spans: &[&[InternalQueryTerm]],
) -> Result<Vec<(u32, u32)>, QueryExecError> {
    if query_spans.is_empty() {
        return Err(QueryExecError::new("No query spans provided"));
    }
    let mut leaders = Vec::with_capacity(query_spans.len());
    // If you change this code so that it doesn't always add a leader for the first span,
    // make sure to update the unwrap below.
    leaders.push((token_id, query_spans[0].len() as u32));
    for span in query_spans.iter().skip(1) {
        if span.is_empty() {
            return Err(QueryExecError::new("Empty query span found"));
        }
        // This is safe since we always add a leader for the first span.
        let last = leaders[leaders.len() - 1];
        let proximity_len = match span[0].relation {
            QueryRelation::Proximity { distance, .. } => *distance as u32,
            _ => {
                return Err(QueryExecError::new(
                    "First relation found in non-initial span",
                ));
            }
        };
        leaders.push((last.0 + last.1 + proximity_len - 1, span.len() as u32));
    }
    leaders.sort_by_key(|(start, _)| *start);
    Ok(leaders)
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

impl CorpusQueryEngine {
    pub(super) fn resolve_match_tokens(
        &self,
        token_ids: &[u32],
        query_spans: &[&[InternalQueryTerm]],
        context_len: u32,
    ) -> Result<Vec<CorpusQueryMatch<'_>>, QueryExecError> {
        if token_ids.is_empty() {
            return Ok(vec![]);
        }

        // Left start byte, Text start byte, Right start byte, Right end byte
        let mut starts: Vec<(Vec<usize>, Vec<bool>)> = Vec::with_capacity(token_ids.len());
        for &token_id in token_ids {
            let leaders = find_span_leaders(token_id, query_spans)?;
            let span_ranges = compute_offsets(&leaders, context_len, self.corpus.num_tokens)?;
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
        let mut metadata: Vec<CorpusQueryMatchMetadata> = Vec::with_capacity(token_ids.len());
        for &id in token_ids {
            metadata.push(self.resolve_match_token(id)?);
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

    /// Resolves a match token into a full result.
    fn resolve_match_token(
        &self,
        token_id: u32,
    ) -> Result<CorpusQueryMatchMetadata<'_>, QueryExecError> {
        let work_ranges = &self.corpus.work_lookup;
        let work_idx = work_ranges
            .binary_search_by(|row_data| {
                let range = &row_data.1;
                let work_start_token_id = range[0].1;
                let work_end_token_id = range[range.len() - 1].2;
                if token_id < work_start_token_id {
                    std::cmp::Ordering::Greater
                } else if token_id >= work_end_token_id {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map_err(|_| {
                QueryExecError::new(&format!("TokenId {token_id} not found in any work."))
            })?;

        let row_data = &work_ranges[work_idx].1;
        let row_info = row_data
            .binary_search_by(|(_, start, end)| {
                if token_id < *start {
                    std::cmp::Ordering::Greater
                } else if token_id >= *end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map(|i| &row_data[i])
            .map_err(|_| {
                QueryExecError::new(&format!(
                    "TokenId {token_id} not found in any row for work index {work_idx}."
                ))
            })?;

        let (work_id, _, work_data) = &self.corpus.work_lookup[work_idx];

        Ok(CorpusQueryMatchMetadata {
            work_id,
            work_name: &work_data.name,
            author: &work_data.author,
            section: &row_info.0,
            offset: token_id - row_info.1,
        })
    }
}
