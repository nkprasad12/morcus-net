use crate::{
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, IntermediateResult, QueryExecError,
        corpus_query_conversion::InternalQueryTerm,
        index_data::{apply_and_to_indices, apply_or_to_indices},
    },
    corpus_serialization::StoredMapValue,
    profiler::TimeProfiler,
    query_parsing_v2::{
        QueryRelation, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    },
};

fn split_into_spans<'a>(
    query: &'a [InternalQueryTerm<'a>],
) -> Result<Vec<&'a [InternalQueryTerm<'a>]>, QueryExecError> {
    let mut spans = Vec::new();
    let mut span_start = 0;
    for i in 0..=query.len() {
        if i < query.len() && query[i].is_contiguous() {
            continue;
        }
        let span = &query[span_start..i];
        if span.is_empty() {
            return Err(QueryExecError::new("Empty span in query"));
        }
        span_start = i;
        spans.push(span);
    }
    Ok(spans)
}

// Basic methods for calculating indices corresponding to query terms.
impl CorpusQueryEngine {
    fn compute_index_for_composed(
        &'_ self,
        children: &[TokenConstraint],
        op: &TokenConstraintOperation,
    ) -> Result<Option<IndexDataRoO<'_>>, QueryExecError> {
        // Sort the children by their upper size bounds. For `and` operations, we want the
        // smallest upper bound first so the most constrained children are considered first.
        // For `or` operations, we want the largest upper bound first so that we hopefully
        // start and stick with a bitmask.
        let mut internal_children = children
            .iter()
            .map(|c| self.convert_constraint(c))
            .collect::<Result<Vec<_>, _>>()?;
        internal_children.sort_by_key(|c| c.size_bounds.upper);
        if *op == TokenConstraintOperation::Or {
            internal_children.reverse();
        }

        let first = internal_children
            .first()
            .ok_or(QueryExecError::new("Empty composed query"))?;
        let mut data = match self.compute_index_for(first.inner)? {
            Some(data) => data,
            None => return Ok(None),
        };

        for child in internal_children.iter().skip(1) {
            let child_data = match self.compute_index_for(child.inner)? {
                Some(data) => data,
                None => return Ok(None),
            };
            let combined = match op {
                TokenConstraintOperation::And => {
                    apply_and_to_indices(&data.to_ref(), 0, &child_data.to_ref(), 0)
                }
                TokenConstraintOperation::Or => {
                    apply_or_to_indices(&data.to_ref(), 0, &child_data.to_ref(), 0)
                }
            };
            data = IndexDataRoO::Owned(combined?.0);
        }
        Ok(Some(data))
    }

    /// Computes the candidate index for a particular token constraint.
    fn compute_index_for(
        &'_ self,
        constraint: &TokenConstraint,
    ) -> Result<Option<IndexDataRoO<'_>>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => Ok(self.index_for_atom(atom)),
            TokenConstraint::Composed { children, op } => {
                self.compute_index_for_composed(children, op)
            }
            TokenConstraint::Negated(_) => {
                Err(QueryExecError::new("Negated constraints are not supported"))
            }
        }
    }

    pub(super) fn compute_query_candidates(
        &'_ self,
        query: &Vec<InternalQueryTerm>,
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IntermediateResult<'_>>, QueryExecError> {
        let mut indexed_terms: Vec<(usize, &InternalQueryTerm)> =
            query.iter().enumerate().collect();
        indexed_terms.sort_by_key(|(_, term)| term.constraint.size_bounds.upper);

        let (first_original_index, first_term) = indexed_terms
            .first()
            .ok_or(QueryExecError::new("Empty query"))?;
        let mut data = match self.compute_index_for(first_term.constraint.inner)? {
            Some(data) => data,
            _ => return Ok(None),
        };
        profiler.phase("Initial candidates");
        let mut position = *first_original_index as u32;

        for (original_index, term) in indexed_terms.iter().skip(1) {
            let term_data = match self.compute_index_for(term.constraint.inner)? {
                Some(data) => data,
                _ => return Ok(None),
            };
            let result = match term.relation {
                QueryRelation::After | QueryRelation::First => apply_and_to_indices(
                    &data.to_ref(),
                    position,
                    &term_data.to_ref(),
                    *original_index as u32,
                ),
                _ => return Err(QueryExecError::new("Unsupported query relation")),
            }?;
            data = IndexDataRoO::Owned(result.0);
            position = result.1;
            profiler.phase(format!("Filter from {original_index}").as_str());
        }
        Ok(Some(IntermediateResult { data, position }))
    }

    /// Returns the hard breaks, verifying that it is a bitmask.
    pub(super) fn get_hard_breaks(&self) -> Result<&[u64], QueryExecError> {
        let index = self
            .get_index("breaks", "hard")
            .ok_or(QueryExecError::new("No hard breaks index found"))?;
        match index {
            IndexDataRoO::Ref(IndexData::BitMask(bm)) => Ok(bm),
            _ => Err(QueryExecError::new("Hard breaks index is not a bitmask")),
        }
    }

    pub(super) fn get_metadata_for(&self, part: &TokenConstraintAtom) -> Option<&StoredMapValue> {
        match part {
            TokenConstraintAtom::Word(word) => self.get_metadata("word", &word.to_lowercase()),
            TokenConstraintAtom::Lemma(lemma) => self.get_metadata("lemma", lemma),
            &TokenConstraintAtom::Inflection(inflection) => {
                self.get_metadata(inflection.get_label(), &inflection.get_code())
            }
        }
    }

    fn index_for_atom(&'_ self, part: &TokenConstraintAtom) -> Option<IndexDataRoO<'_>> {
        self.index_for_metadata(self.get_metadata_for(part)?)
    }

    fn index_for_metadata(&'_ self, metadata: &StoredMapValue) -> Option<IndexDataRoO<'_>> {
        self.raw_buffers
            .resolve_index(metadata, self.corpus.num_tokens)
            .ok()
            .map(IndexDataRoO::Ref)
    }

    fn get_metadata(&self, key: &str, value: &str) -> Option<&StoredMapValue> {
        self.corpus.indices.get(key)?.get(value)
    }

    fn get_index(&'_ self, key: &str, value: &str) -> Option<IndexDataRoO<'_>> {
        self.index_for_metadata(self.get_metadata(key, value)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        corpus_query_engine::corpus_query_conversion::{InternalConstraint, SizeBounds},
        query_parsing_v2::{TokenConstraint, TokenConstraintAtom},
    };

    fn make_term(relation: QueryRelation) -> InternalQueryTerm<'static> {
        // This is a bit of a hack to get a 'static TokenConstraint.
        // In a real scenario, constraints are built within the query context.
        let constraint = Box::leak(Box::new(TokenConstraint::Atom(TokenConstraintAtom::Word(
            "test".to_string(),
        ))));
        let relation = Box::leak(Box::new(relation));

        InternalQueryTerm {
            constraint: InternalConstraint {
                inner: constraint,
                size_bounds: SizeBounds { lower: 0, upper: 0 },
            },
            relation,
        }
    }

    #[test]
    fn test_split_into_spans_single_span() {
        let query = vec![
            make_term(QueryRelation::First),
            make_term(QueryRelation::After),
        ];
        let spans = split_into_spans(&query).unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].len(), 2);
    }

    #[test]
    fn test_split_into_spans_multiple_spans() {
        let query = vec![
            make_term(QueryRelation::First),
            make_term(QueryRelation::Proximity {
                distance: 5,
                is_directed: false,
            }),
            make_term(QueryRelation::After),
        ];
        let spans = split_into_spans(&query).unwrap();
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].len(), 1);
        assert_eq!(spans[1].len(), 2);
    }

    #[test]
    fn test_split_into_spans_all_non_contiguous() {
        let query = vec![
            make_term(QueryRelation::First),
            make_term(QueryRelation::Proximity {
                distance: 2,
                is_directed: false,
            }),
            make_term(QueryRelation::Proximity {
                distance: 3,
                is_directed: true,
            }),
        ];
        let spans = split_into_spans(&query).unwrap();
        assert_eq!(spans.len(), 3);
        assert_eq!(spans[0].len(), 1);
        assert_eq!(spans[1].len(), 1);
        assert_eq!(spans[2].len(), 1);
    }

    #[test]
    fn test_split_into_spans_multiple_spans_with_multiple_parts() {
        let query = vec![
            make_term(QueryRelation::First),
            make_term(QueryRelation::After),
            make_term(QueryRelation::Proximity {
                distance: 2,
                is_directed: false,
            }),
            make_term(QueryRelation::After),
            make_term(QueryRelation::After),
            make_term(QueryRelation::Proximity {
                distance: 3,
                is_directed: true,
            }),
        ];
        let spans = split_into_spans(&query).unwrap();
        assert_eq!(spans.len(), 3);
        assert_eq!(spans[0].len(), 2);
        assert_eq!(spans[1].len(), 3);
        assert_eq!(spans[2].len(), 1);
    }

    #[test]
    fn test_split_into_spans_empty_query() {
        let query = vec![];
        let spans = split_into_spans(&query);
        assert!(spans.is_err());
    }

    #[test]
    fn test_split_into_spans_single_term() {
        let query = vec![make_term(QueryRelation::After)];
        let spans = split_into_spans(&query).unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].len(), 1);
    }
}
