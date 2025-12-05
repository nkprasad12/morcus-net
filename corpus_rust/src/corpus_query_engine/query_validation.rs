use crate::query_parsing_v2::{
    Query, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
};

fn has_negations(term: &TokenConstraint) -> bool {
    match term {
        TokenConstraint::Negated(_) => true,
        TokenConstraint::Atom(_) => false,
        TokenConstraint::Composed { children, .. } => children.iter().any(has_negations),
    }
}

pub(super) fn operators_in(term: &TokenConstraint) -> Vec<TokenConstraintOperation> {
    match term {
        TokenConstraint::Composed { op, children } => {
            let mut ops = vec![*op];
            for child in children {
                ops.extend(operators_in(child));
            }
            ops
        }
        _ => vec![],
    }
}

pub(super) fn atoms_in(term: &TokenConstraint) -> Vec<&TokenConstraintAtom> {
    match term {
        TokenConstraint::Atom(s) => vec![s],
        TokenConstraint::Negated(child) => atoms_in(child),
        TokenConstraint::Composed { children, .. } => {
            let mut atoms = vec![];
            for child in children {
                atoms.extend(atoms_in(child));
            }
            atoms
        }
    }
}

fn max_level_of_contstraint(term: &TokenConstraint) -> usize {
    match term {
        TokenConstraint::Atom(_) => 1,
        TokenConstraint::Negated(child) => max_level_of_contstraint(child),
        TokenConstraint::Composed { children, .. } => {
            children
                .iter()
                .map(max_level_of_contstraint)
                .max()
                .unwrap_or(1)
                + 1
        }
    }
}

fn is_term_currently_supported(term: &TokenConstraint) -> bool {
    if has_negations(term) {
        return false;
    }
    // Currently, we only support atoms or an AND or OR of atoms.
    if max_level_of_contstraint(term) > 2 {
        return false;
    }
    let ops = operators_in(term);
    let has_or = ops.contains(&TokenConstraintOperation::Or);
    let has_and = ops.contains(&TokenConstraintOperation::And);
    if has_or && has_and {
        // Currently we can't support both because it complicates the compatibility checking.
        return false;
    }
    true
}

pub(super) fn is_query_currently_supported(query: &Query) -> bool {
    query
        .terms
        .iter()
        .all(|term| is_term_currently_supported(&term.constraint))
}
