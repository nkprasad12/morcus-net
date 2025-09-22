use crate::{
    bitmask_utils::Direction,
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, IntermediateResult, QueryExecError,
        corpus_query_conversion::InternalQueryTerm,
        index_data::{apply_and_to_indices, apply_or_to_indices, find_fuzzy_matches},
    },
    corpus_serialization::StoredMapValue,
    profiler::TimeProfiler,
    query_parsing_v2::{
        QueryRelation, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    },
};

struct SpanResult<'a> {
    candidates: IntermediateResult<'a>,
    length: usize,
    relation: QueryRelation,
}

pub(super) fn split_into_spans<'a>(
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
        query_spans: &[&[InternalQueryTerm]],
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IntermediateResult<'_>>, QueryExecError> {
        let mut spans = match self.candidates_for_spans(query_spans, profiler)? {
            Some(res) => res,
            None => return Ok(None),
        };
        if spans.is_empty() {
            return Err(QueryExecError::new("No spans found in query"));
        }
        let mut previous = spans.remove(spans.len() - 1);
        while !spans.is_empty() {
            let current = spans.remove(spans.len() - 1);
            let (distance, is_directed) = match previous.relation {
                QueryRelation::Proximity {
                    distance,
                    is_directed,
                } => (distance, is_directed),
                _ => {
                    return Err(QueryExecError::new(
                        "Only proximity relations are supported between spans",
                    ));
                }
            };
            if distance == 0 || distance >= 16 {
                return Err(QueryExecError::new(
                    "Proximity distance must be between 1 and 15",
                ));
            }
            let dir = if is_directed {
                Direction::Left
            } else {
                Direction::Both
            };
            let combined = find_fuzzy_matches(
                &current.candidates.data.to_ref(),
                current.candidates.position,
                &previous.candidates.data.to_ref(),
                previous.candidates.position - previous.length as u32,
                distance as usize,
                dir,
            )?;
            previous = SpanResult {
                candidates: IntermediateResult {
                    data: IndexDataRoO::Owned(combined),
                    position: current.candidates.position,
                },
                ..current
            }
        }
        Ok(Some(previous.candidates))
    }

    /// Computes candidates for each span.
    fn candidates_for_spans(
        &'_ self,
        spans: &[&[InternalQueryTerm]],
        profiler: &mut TimeProfiler,
    ) -> Result<Option<Vec<SpanResult<'_>>>, QueryExecError> {
        let mut span_results = Vec::new();
        for span in spans {
            let candidates = match self.candidates_for_single_span(span, profiler)? {
                Some(res) => res,
                None => return Ok(None),
            };
            span_results.push(SpanResult {
                candidates,
                length: span.len(),
                relation: span[0].relation.clone(),
            });
        }
        Ok(Some(span_results))
    }

    fn candidates_for_single_span(
        &'_ self,
        query: &[InternalQueryTerm],
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IntermediateResult<'_>>, QueryExecError> {
        let mut indexed_terms: Vec<(usize, &InternalQueryTerm)> =
            query.iter().enumerate().collect();
        indexed_terms.sort_by_key(|(_, term)| term.constraint.size_bounds.upper);
        let prt = query
            .iter()
            .map(|t| t.to_string())
            .collect::<Vec<_>>()
            .join("");
        eprintln!("{}", prt);

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
            let result = apply_and_to_indices(
                &data.to_ref(),
                position,
                &term_data.to_ref(),
                *original_index as u32,
            )?;
            data = IndexDataRoO::Owned(result.0);
            position = result.1;
            profiler.phase(format!("Filter from {original_index}").as_str());
        }
        if query.len() > 1 {
            let result = self.filter_breaks(
                &IntermediateResult { data, position },
                query.len(),
                profiler,
            )?;
            data = result.data;
            position = result.position;
            profiler.phase("Filter breaks");
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
