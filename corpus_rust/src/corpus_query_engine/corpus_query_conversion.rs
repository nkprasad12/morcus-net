use std::cmp::{max, min};

use crate::{
    corpus_query_engine::{
        CorpusQueryEngine, QueryExecError, affix_index::AffixPlan,
        corpus_index_calculation::AtomPostings,
    },
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

/// An atom, resolved once per query.
#[derive(Debug, Clone)]
pub(super) enum InternalAtom<'a> {
    Postings(AtomPostings<'a>),
    Affix(AffixPlan<'a>),
    /// Matches nothing (e.g. a word that isn't in the corpus).
    Missing,
}

#[derive(Debug, Clone)]
pub(super) enum InternalConstraintKind<'a> {
    Atom(InternalAtom<'a>),
    Composed {
        op: TokenConstraintOperation,
        children: Vec<InternalConstraint<'a>>,
    },
    /// Not executable yet; converted only for its size bounds.
    Negated,
}

#[derive(Debug, Clone)]
pub struct InternalConstraint<'a> {
    pub inner: &'a TokenConstraint,
    pub size_bounds: SizeBounds,
    pub(super) kind: InternalConstraintKind<'a>,
}

impl<'a> InternalConstraint<'a> {
    pub(super) fn as_affix(&self) -> Option<&AffixPlan<'a>> {
        match &self.kind {
            InternalConstraintKind::Atom(InternalAtom::Affix(plan)) => Some(plan),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct InternalQueryTerm<'a> {
    pub relation: &'a QueryRelation,
    pub constraint: InternalConstraint<'a>,
}

impl InternalQueryTerm<'_> {
    /// Whether this term must be contiguous with the previous term.
    pub fn is_contiguous(&self) -> bool {
        matches!(self.relation, QueryRelation::After | QueryRelation::First)
    }
}

impl std::fmt::Display for InternalQueryTerm<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}", self.relation, self.constraint.inner)
    }
}

// Methods for converting a query to an internal form.
impl CorpusQueryEngine {
    /// Resolves an atom, with its number of matches in the whole corpus.
    fn convert_atom<'a>(&'a self, atom: &'a TokenConstraintAtom) -> (InternalAtom<'a>, usize) {
        if let TokenConstraintAtom::Affix(pattern) = atom {
            let plan = self.plan_affix(pattern);
            let hits = plan.corpus_hits;
            return (InternalAtom::Affix(plan), hits);
        }
        match self.get_postings_for(atom) {
            Some(postings) => {
                let hits = self.num_postings(&postings) as usize;
                (InternalAtom::Postings(postings), hits)
            }
            None => (InternalAtom::Missing, 0),
        }
    }

    /// Converts a constraint to its internal representation, calculating size bounds appropriately.
    pub(super) fn convert_constraint<'a>(
        &'a self,
        constraint: &'a TokenConstraint,
    ) -> Result<InternalConstraint<'a>, QueryExecError> {
        match constraint {
            TokenConstraint::Atom(atom) => {
                let (atom, hits) = self.convert_atom(atom);
                Ok(InternalConstraint {
                    inner: constraint,
                    size_bounds: SizeBounds {
                        upper: hits,
                        lower: hits,
                    },
                    kind: InternalConstraintKind::Atom(atom),
                })
            }
            TokenConstraint::Composed { op, children } => {
                let children = children
                    .iter()
                    .map(|child| self.convert_constraint(child))
                    .collect::<Result<Vec<_>, _>>()?;
                let first = children
                    .first()
                    .ok_or(QueryExecError::new("Empty composed query"))?;
                let mut lower = first.size_bounds.lower;
                let mut upper = first.size_bounds.upper;
                for converted in children.iter().skip(1) {
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
                    kind: InternalConstraintKind::Composed { op: *op, children },
                })
            }
            TokenConstraint::Negated(inner) => {
                let converted = self.convert_constraint(inner)?;
                let n = self.corpus.num_tokens as usize;
                let upper = n.saturating_sub(converted.size_bounds.lower);
                let lower = n.saturating_sub(converted.size_bounds.upper);
                Ok(InternalConstraint {
                    inner: constraint,
                    size_bounds: SizeBounds { upper, lower },
                    kind: InternalConstraintKind::Negated,
                })
            }
        }
    }

    pub(super) fn convert_query_term<'a>(
        &'a self,
        term: &'a QueryTerm,
    ) -> Result<InternalQueryTerm<'a>, QueryExecError> {
        let constraint = self.convert_constraint(&term.constraint)?;
        Ok(InternalQueryTerm {
            relation: &term.relation,
            constraint,
        })
    }
}
