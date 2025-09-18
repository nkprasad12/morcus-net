use std::cmp::{max, min};

use crate::{
    corpus_query_engine::{CorpusQueryEngine, QueryExecError},
    query_parsing_v2::{
        QueryRelation, QueryTerm, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
    },
};

// Internal types for query processing
#[derive(Debug, Clone)]
pub struct SizeBounds {
    pub upper: usize,
    pub lower: usize,
}

#[derive(Debug, Clone)]
struct InternalAtom {
    size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
pub struct InternalConstraint<'a> {
    pub inner: &'a TokenConstraint,
    pub size_bounds: SizeBounds,
}

#[derive(Debug, Clone)]
pub struct InternalQueryTerm<'a> {
    pub relation: &'a QueryRelation,
    pub constraint: InternalConstraint<'a>,
}

// Methods for converting a query to an internal form.
impl CorpusQueryEngine {
    /// Get the size bounds for a token constraint atom. This should be present in the raw data.
    fn get_bounds_for_atom(&self, atom: &TokenConstraintAtom) -> SizeBounds {
        let metadata = match self.get_metadata_for(atom) {
            Some(m) => m,
            None => {
                return SizeBounds { upper: 0, lower: 0 };
            }
        };
        let elements_in_index = self.raw_buffers.num_elements(metadata);
        SizeBounds {
            upper: elements_in_index as usize,
            lower: elements_in_index as usize,
        }
    }

    /// Converts an atom to its internal representation.
    fn convert_atom(&self, atom: &TokenConstraintAtom) -> InternalAtom {
        InternalAtom {
            size_bounds: self.get_bounds_for_atom(atom),
        }
    }

    /// Converts a constraint to its internal representation, calculating size bounds appropriately.
    pub fn convert_constraint<'a>(
        &self,
        constraint: &'a TokenConstraint,
    ) -> Result<InternalConstraint<'a>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => {
                let internal_atom = self.convert_atom(atom);
                let size_bounds = internal_atom.size_bounds.clone();
                Ok(InternalConstraint {
                    inner: constraint,
                    size_bounds,
                })
            }
            TokenConstraint::Composed { op, children } => {
                let first = self.convert_constraint(
                    children
                        .first()
                        .ok_or(QueryExecError::new("Empty composed query"))?,
                )?;
                let mut lower = first.size_bounds.lower;
                let mut upper = first.size_bounds.upper;
                for child in children.iter().skip(1) {
                    let converted = self.convert_constraint(child)?;
                    if *op == TokenConstraintOperation::And {
                        // These bounds are not quite tight due to the pigeonhole principle
                        // if the upper bounds are more than half the number of tokens,
                        // but we can ignore that for now.
                        lower = 0;
                        upper = min(upper, converted.size_bounds.upper);
                    } else {
                        lower = max(lower, converted.size_bounds.lower);
                        upper = max(upper, converted.size_bounds.upper);
                    }
                }
                Ok(InternalConstraint {
                    inner: constraint,
                    size_bounds: SizeBounds { upper, lower },
                })
            }
            TokenConstraint::Negated(inner) => {
                let converted = self.convert_constraint(inner)?;
                let n = self.corpus.num_tokens as usize;
                let upper = n - converted.size_bounds.lower;
                let lower = n - converted.size_bounds.upper;
                Ok(InternalConstraint {
                    inner,
                    size_bounds: SizeBounds { upper, lower },
                })
            }
        }
    }

    pub fn convert_query_term<'a>(
        &self,
        term: &'a QueryTerm,
    ) -> Result<InternalQueryTerm<'a>, QueryExecError> {
        let constraint = self.convert_constraint(&term.constraint)?;
        Ok(InternalQueryTerm {
            relation: &term.relation,
            constraint,
        })
    }
}
