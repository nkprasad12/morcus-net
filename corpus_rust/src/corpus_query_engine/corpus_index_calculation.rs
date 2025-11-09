use crate::{
    bitmask_utils::Direction,
    corpus_index::StoredMapValue,
    corpus_query_engine::{
        CorpusQueryEngine, IndexData, IndexDataRoO, QueryExecError,
        corpus_query_conversion::InternalQueryTerm,
        index_data::{
            IndexRange, IndexSlice, apply_and_to_indices, apply_or_to_indices, find_fuzzy_matches,
        },
    },
    profiler::TimeProfiler,
    query_parsing_v2::{
        QueryRelation, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    },
};

pub(super) struct SpanResult<'a> {
    candidates: IndexSlice<'a>,
    length: usize,
    relation: QueryRelation,
}

/// Splits a query into spans of contiguous terms. A span is a sequence of terms
/// that need to be directly to the right of the previous term in the sequence (in
/// particular, proximity relations break spans).
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

fn combine_span_candidates<'a>(
    previous: &'a SpanResult<'a>,
    current: &SpanResult<'a>,
) -> Result<SpanResult<'a>, QueryExecError> {
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
    let second = IndexSlice {
        position: previous.candidates.position - previous.length as u32,
        ..previous.candidates.to_ref()
    };
    let combined = find_fuzzy_matches(&current.candidates, &second, distance as usize, dir)?;
    Ok(SpanResult {
        candidates: combined,
        length: previous.length + current.length,
        relation: current.relation.clone(),
    })
}

// Basic methods for calculating indices corresponding to query terms.
impl CorpusQueryEngine {
    fn compute_index_for_composed<'a>(
        &'a self,
        children: &'a [TokenConstraint],
        op: &'a TokenConstraintOperation,
        range: &'a IndexRange,
    ) -> Result<Option<IndexSlice<'a>>, QueryExecError> {
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
        let mut data = match self.compute_index_for(first.inner, range)? {
            Some(data) => data,
            None => return Ok(None),
        };

        for child in internal_children.iter().skip(1) {
            let child_data = match self.compute_index_for(child.inner, range)? {
                Some(data) => data,
                None => return Ok(None),
            };
            data = match op {
                TokenConstraintOperation::And => apply_and_to_indices(&data, &child_data),
                TokenConstraintOperation::Or => apply_or_to_indices(&data, &child_data),
            }?;
        }
        Ok(Some(data))
    }

    /// Computes the candidate index for a particular token constraint.
    fn compute_index_for<'a>(
        &'a self,
        constraint: &'a TokenConstraint,
        range: &'a IndexRange,
    ) -> Result<Option<IndexSlice<'a>>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => Ok(self.index_for_atom(atom, range)),
            TokenConstraint::Composed { children, op } => {
                self.compute_index_for_composed(children, op, range)
            }
            TokenConstraint::Negated(_) => {
                Err(QueryExecError::new("Negated constraints are not supported"))
            }
        }
    }

    pub(super) fn compute_query_candidates<'a>(
        &'a self,
        spans: &'a [SpanResult<'a>],
    ) -> Result<IndexSlice<'a>, QueryExecError> {
        if spans.is_empty() {
            return Err(QueryExecError::new("No spans found in query"));
        }
        let n = spans.len();
        if n == 1 {
            return Ok(spans[0].candidates.to_ref());
        }
        let mut previous = combine_span_candidates(&spans[n - 1], &spans[n - 2])?;
        for current in spans.iter().rev().skip(2) {
            previous = combine_span_candidates(current, &previous)?;
        }
        Ok(previous.candidates)
    }

    /// Computes candidates for each span.
    pub(super) fn candidates_for_spans<'a>(
        &'a self,
        spans: &'a [&[InternalQueryTerm]],
        range: &'a IndexRange,
        profiler: &mut TimeProfiler,
    ) -> Result<Option<Vec<SpanResult<'a>>>, QueryExecError> {
        let mut span_results = Vec::new();
        for span in spans {
            let candidates = match self.candidates_for_single_span(span, range, profiler)? {
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

    fn candidates_for_single_span<'a>(
        &'a self,
        query: &'a [InternalQueryTerm],
        range: &'a IndexRange,
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IndexSlice<'a>>, QueryExecError> {
        let mut indexed_terms: Vec<(usize, &InternalQueryTerm)> =
            query.iter().enumerate().collect();
        indexed_terms.sort_by_key(|(_, term)| term.constraint.size_bounds.upper);

        let (first_original_index, first_term) = indexed_terms
            .first()
            .ok_or(QueryExecError::new("Empty query"))?;
        let mut data = match self.compute_index_for(first_term.constraint.inner, range)? {
            Some(data) => data,
            _ => return Ok(None),
        };
        data = IndexSlice {
            position: *first_original_index as u32,
            ..data
        };

        profiler.phase("Initial candidates");

        for (original_index, term) in indexed_terms.iter().skip(1) {
            let term_data = match self.compute_index_for(term.constraint.inner, range)? {
                Some(data) => data,
                _ => return Ok(None),
            };
            let term_data = IndexSlice {
                position: *original_index as u32,
                ..term_data
            };
            data = apply_and_to_indices(&data, &term_data)?;
            profiler.phase(format!("Filter from {original_index}").as_str());
        }
        if query.len() > 1 {
            let result = self.filter_breaks(&data, query.len(), profiler)?;
            profiler.phase("Filter breaks");
            return Ok(Some(result));
        }
        Ok(Some(data))
    }

    /// Returns the hard breaks, verifying that it is a bitmask.
    pub(super) fn get_hard_breaks<'a>(
        &'a self,
        range: &'a IndexRange,
    ) -> Result<&'a [u64], QueryExecError> {
        let index = self
            .get_index("breaks", "hard", range)
            .ok_or(QueryExecError::new("No hard breaks index found"))?;
        let bitmask = match index.data {
            IndexDataRoO::Ref(IndexData::BitMask(bm)) => Ok(bm),
            _ => Err(QueryExecError::new("Hard breaks index is not a bitmask")),
        }?;
        Ok(bitmask)
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

    fn index_for_atom<'a>(
        &'a self,
        part: &'a TokenConstraintAtom,
        range: &'a IndexRange,
    ) -> Option<IndexSlice<'a>> {
        self.index_for_metadata(self.get_metadata_for(part)?, range)
    }

    fn index_for_metadata<'a>(
        &'a self,
        metadata: &'a StoredMapValue,
        range: &'a IndexRange,
    ) -> Option<IndexSlice<'a>> {
        let full = self
            .raw_buffers
            .resolve_index(metadata, self.corpus.num_tokens)
            .ok()?;
        IndexSlice::from(&full, range, 0).ok()
    }

    fn get_metadata(&self, key: &str, value: &str) -> Option<&StoredMapValue> {
        self.corpus.indices.get(key)?.get(value)
    }

    fn get_index<'a>(
        &'a self,
        key: &'a str,
        value: &'a str,
        range: &'a IndexRange,
    ) -> Option<IndexSlice<'a>> {
        self.index_for_metadata(self.get_metadata(key, value)?, range)
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
