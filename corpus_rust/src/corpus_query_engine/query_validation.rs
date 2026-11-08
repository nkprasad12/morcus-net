use crate::api::QueryExecError;
use crate::query_parsing_v2::{
    Query, TokenConstraint, TokenConstraintAtom, TokenConstraintOperation,
};

/// Each wildcard term can expand to tens of thousands of words.
const MAX_WILDCARD_TERMS: usize = 3;

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

pub(super) fn validate_query(query: &Query) -> Result<(), QueryExecError> {
    let wildcards = query
        .terms
        .iter()
        .flat_map(|term| atoms_in(&term.constraint))
        .filter(|atom| matches!(atom, TokenConstraintAtom::Affix(_)))
        .count();
    if wildcards > MAX_WILDCARD_TERMS {
        return Err(QueryExecError::new(&format!(
            "Queries can contain at most {MAX_WILDCARD_TERMS} wildcard ('*') terms"
        )));
    }
    // Wildcards are parsed, but not executed yet.
    let supported = wildcards == 0
        && query
            .terms
            .iter()
            .all(|term| is_term_currently_supported(&term.constraint));
    if !supported {
        return Err(QueryExecError::new(
            "The given query contains constructs that are not yet supported",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query_parsing_v2::parse_query;

    fn validate(query: &str) -> Result<(), String> {
        validate_query(&parse_query(query).unwrap()).map_err(|e| e.message)
    }

    #[test]
    fn accepts_supported_queries() {
        for query in [
            "et",
            "@lemma:do oscula @case:dat",
            "(@case:dat or @voice:passive)",
        ] {
            assert_eq!(validate(query), Ok(()), "{query}");
        }
    }

    #[test]
    fn rejects_unsupported_constructs() {
        for query in ["!et", "((et or in) and @case:abl)"] {
            assert!(
                validate(query).unwrap_err().contains("not yet supported"),
                "{query}"
            );
        }
    }

    #[test]
    fn limits_wildcard_terms() {
        let too_many = "Queries can contain at most 3 wildcard ('*') terms";
        for query in [
            "con* *que in*bilis per*",
            "(con* or *que) (in*bilis or per*)",
            "con* ~ (*que and @case:abl) ~ in*bilis ~ !per*",
        ] {
            assert_eq!(validate(query), Err(too_many.to_string()), "{query}");
        }
        // Up to 3 parse and count fine, but don't run yet.
        for query in [
            "con* *que in*bilis",
            "(con* or *que) in*bilis",
            "*que",
            "[Caesar] *que",
        ] {
            assert!(
                validate(query).unwrap_err().contains("not yet supported"),
                "{query}"
            );
        }
    }
}
