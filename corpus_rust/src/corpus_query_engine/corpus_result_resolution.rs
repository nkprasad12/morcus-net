use std::cmp::{max, min};

use crate::corpus_query_engine::{
    CorpusQueryEngine, CorpusQueryMatch, CorpusQueryMatchMetadata, QueryExecError,
};

impl CorpusQueryEngine {
    pub(super) fn resolve_match_tokens(
        &self,
        token_ids: &[u32],
        query_length: u32,
        context_len: u32,
    ) -> Result<Vec<CorpusQueryMatch<'_>>, QueryExecError> {
        if token_ids.is_empty() {
            return Ok(vec![]);
        }

        // Left start byte, Text start byte, Right start byte, Right end byte
        let mut starts: Vec<(Vec<usize>, Vec<bool>)> = Vec::with_capacity(token_ids.len());
        for &token_id in token_ids {
            let left_start_idx = max(0, token_id.saturating_sub(context_len));
            let right_end_idx = min(
                token_id + query_length + context_len,
                self.corpus.num_tokens,
            );

            let offsets = vec![
                self.starts.token_start(left_start_idx)?,
                self.starts.token_start(token_id)?,
                self.starts.break_start(token_id + (query_length - 1))?,
                self.starts.break_start(right_end_idx - 1)?,
            ];
            let is_core_match = vec![false, true, false];
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
