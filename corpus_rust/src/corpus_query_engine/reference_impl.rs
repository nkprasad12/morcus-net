#![cfg(test)]

use crate::{
    api::CorpusQueryMatch,
    corpus_query_engine::{CorpusQueryEngine, CorpusQueryResult, IndexData, QueryExecError},
    query_parsing_v2::{QueryTerm, TokenConstraint, parse_query},
};

impl QueryExecError {
    fn unimplemented() -> Self {
        QueryExecError {
            message: "Unimplemented".to_string(),
        }
    }
}

impl CorpusQueryEngine {
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
                    _ => Err(QueryExecError::unimplemented()),
                }
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
        id: u32,
        context_len: usize,
    ) -> Result<CorpusQueryMatch<'_>, QueryExecError> {
        let id = id as usize;
        let left_start_id = self
            .starts
            .token_start(id.saturating_sub(context_len).try_into().unwrap())?;
        let left_end_id = self.starts.token_start(id.try_into().unwrap())?;
        let right_start_id = self.starts.break_start(id as u32)?;
        let right_end_id = self.starts.break_start(
            (id + context_len)
                .min((self.corpus.num_tokens - 1).try_into().unwrap())
                .try_into()
                .unwrap(),
        )?;
        let text = vec![
            (self.text.slice(left_start_id, left_end_id), false),
            (self.text.slice(left_end_id, right_start_id), true),
            (self.text.slice(right_start_id, right_end_id), false),
        ];
        Ok(CorpusQueryMatch {
            metadata: self.corpus.resolve_match_token(id as u32)?,
            text,
        })
    }

    pub(super) fn query_corpus_ref_impl(
        &self,
        query_str: &str,
        page_start: usize,
        page_size: usize,
        context_len: usize,
    ) -> Result<CorpusQueryResult<'_>, QueryExecError> {
        let query =
            parse_query(query_str).map_err(|_| QueryExecError::new("Failed to parse query"))?;
        let first = &query.terms[0];
        let index = self.index_for_term(first)?;

        if page_start != 0 {
            return Err(QueryExecError::unimplemented());
        }
        let matches = index
            .iter()
            .take(page_size)
            .map(|id| self.resolve_match_ref_impl(*id, context_len).unwrap())
            .collect();
        let result = CorpusQueryResult {
            total_results: index.len(),
            page_start: 0,
            timing: vec![],
            matches,
        };

        Ok(result)
    }
}
