use crate::{
    common::IndexData,
    corpus_query_engine::{
        CorpusQueryEngine, IntermediateResult, QueryExecError, query_conversion::InternalQueryTerm,
    },
    corpus_serialization::StoredMapValue,
    packed_index_utils::{apply_and_to_indices, apply_or_to_indices},
    profiler::TimeProfiler,
    query_parsing_v2::{
        QueryRelation, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    },
};

// Basic methods for calculating indices corresponding to query terms.
impl CorpusQueryEngine {
    fn compute_index_for_composed(
        &self,
        children: &[TokenConstraint],
        op: &TokenConstraintOperation,
    ) -> Result<Option<IndexData>, QueryExecError> {
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
                TokenConstraintOperation::And => apply_and_to_indices(&data, 0, &child_data, 0),
                TokenConstraintOperation::Or => apply_or_to_indices(&data, 0, &child_data, 0),
            };
            data = combined?.0;
        }
        Ok(Some(data))
    }

    /// Computes the candidate index for a particular token constraint.
    fn compute_index_for(
        &self,
        constraint: &TokenConstraint,
    ) -> Result<Option<IndexData>, QueryExecError> {
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
        &self,
        query: &Vec<InternalQueryTerm>,
        profiler: &mut TimeProfiler,
    ) -> Result<Option<IntermediateResult>, QueryExecError> {
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
            (data, position) = match term.relation {
                QueryRelation::After | QueryRelation::First => {
                    apply_and_to_indices(&data, position, &term_data, *original_index as u32)
                }
                _ => return Err(QueryExecError::new("Unsupported query relation")),
            }?;
            profiler.phase(format!("Filter from {original_index}").as_str());
        }
        Ok(Some(IntermediateResult { data, position }))
    }

    /// Returns the hard breaks, verifying that it is a bitmask.
    pub(super) fn get_hard_breaks(&self) -> Result<Vec<u64>, QueryExecError> {
        let index = self
            .get_index("breaks", "hard")
            .ok_or(QueryExecError::new("No hard breaks index found"))?;
        match index {
            IndexData::PackedBitMask(pbm) => Ok(pbm.data),
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

    fn index_for_atom(&self, part: &TokenConstraintAtom) -> Option<IndexData> {
        self.index_for_metadata(self.get_metadata_for(part)?)
    }

    fn index_for_metadata(&self, metadata: &StoredMapValue) -> Option<IndexData> {
        self.raw_buffers
            .resolve_index(metadata, self.corpus.num_tokens)
            .ok()
    }

    fn get_metadata(&self, key: &str, value: &str) -> Option<&StoredMapValue> {
        self.corpus.indices.get(key)?.get(value)
    }

    fn get_index(&self, key: &str, value: &str) -> Option<IndexData> {
        self.index_for_metadata(self.get_metadata(key, value)?)
    }
}
