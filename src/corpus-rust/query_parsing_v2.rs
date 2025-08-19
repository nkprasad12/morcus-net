use std::str::FromStr;

use crate::analyzer_types::LatinInflection;

const DEFAULT_PROXIMITY: u8 = 5;
const SIMPLE_PREFIXES: [&str; 2] = ["@lemma:", "@word:"];

/// A query on the corpus.
#[derive(Debug, Clone)]
pub struct Query {
    pub terms: Vec<QueryTerm>,
}

/// An error that occurs while parsing a query.
#[derive(Debug, Clone)]
pub struct QueryParseError {
    message: String,
}

impl QueryParseError {
    fn new(message: &str) -> Self {
        QueryParseError {
            message: message.to_string(),
        }
    }
}

/// One term in the query. Represents a token and its relationship with the last.
#[derive(Debug, Clone)]
pub struct QueryTerm {
    /// The constraint for this token.
    pub constraint: TokenConstraint,
    /// The relationship this token has with the last token.
    pub relation: QueryRelation,
}

/// Represents a relationship between a current token and a previous token.
#[derive(Debug, Clone, PartialEq)]
pub enum QueryRelation {
    /// A token is exactly after the previous token.
    After,
    /// A token is within N tokens of the previous token.
    Proximity { distance: u8, is_directed: bool },
    /// This is the first term in the query. There is no relation
    /// with a previous token because there is no previous token.
    First,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenConstraintAtom {
    Word(String),
    Lemma(String),
    Inflection(LatinInflection),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TokenConstraintOperation {
    And,
    Or,
}

/// Represents a constraint for one token in the query language.
#[derive(Debug, Clone, PartialEq)]
pub enum TokenConstraint {
    Atom(TokenConstraintAtom),
    Composed {
        op: TokenConstraintOperation,
        children: Vec<TokenConstraint>,
    },
    Negated(Box<TokenConstraint>),
}

macro_rules! check_equal {
    (
        $first:expr,
        $second:expr,
        $message:literal
    ) => {
        if $first != $second {
            return Err(QueryParseError::new($message));
        }
    };
}

/// Helper to parse a token atom from a string
fn parse_token_atom(input: &str) -> Result<TokenConstraintAtom, QueryParseError> {
    for simple_prefix in SIMPLE_PREFIXES.iter() {
        if !input.starts_with(simple_prefix) {
            continue;
        }
        let content = &input[simple_prefix.len()..];
        if content.is_empty() {
            return Err(QueryParseError::new("Empty token atom not allowed"));
        }
        if !content.chars().all(|c| c.is_ascii_alphabetic()) {
            return Err(QueryParseError::new("Token atom must be alphabetic"));
        }
        match *simple_prefix {
            "@lemma:" => return Ok(TokenConstraintAtom::Lemma(content.to_string())),
            "@word:" => return Ok(TokenConstraintAtom::Word(content.to_string())),
            _ => unreachable!(), // We only have two prefixes defined
        }
    }

    if input.starts_with('@') {
        // Handle inflection categories
        let inflection_str = &input[1..];
        if let Ok(inflection) = LatinInflection::from_str(inflection_str) {
            return Ok(TokenConstraintAtom::Inflection(inflection));
        } else {
            return Err(QueryParseError::new("Invalid inflection category"));
        }
    }

    // Default to word for plain text that matches Latin alphabet
    if input.chars().all(|c| c.is_ascii_alphabetic()) && input.len() > 0 {
        return Ok(TokenConstraintAtom::Word(input.to_string()));
    }

    Err(QueryParseError::new(&format!(
        "Invalid token atom: {}",
        input
    )))
}

fn parse_relation(raw_input: &str) -> Result<QueryRelation, QueryParseError> {
    let input = raw_input.trim();
    let n = input.len();
    if n == 0 {
        return Ok(QueryRelation::After);
    }

    if n == 1 {
        check_equal!(input.chars().nth(0), Some('~'), "");
        return Ok(QueryRelation::Proximity {
            distance: 5,
            is_directed: false,
        });
    }

    let penult = input.chars().nth(n - 2);
    let ult = input.chars().nth(n - 1);
    let is_directed = ult == Some('>');
    check_equal!(if is_directed { penult } else { ult }, Some('~'), "");
    let leading = &input[..n - (if is_directed { 2 } else { 1 })];
    let distance = leading.parse::<u8>().unwrap_or(DEFAULT_PROXIMITY);
    Ok(QueryRelation::Proximity { distance, is_directed })
}

/// Parse a token constraint (potentially complex with AND/OR/NOT operations)
fn parse_token_constraint(input: &str) -> Result<TokenConstraint, QueryParseError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(QueryParseError::new("Empty token constraint"));
    }

    // Handle negation using recursion.
    if input.starts_with('!') {
        let inner = input[1..].trim();
        let has_parens = inner.starts_with('(') && inner.ends_with(')');
        let i = if has_parens { 1 } else { 0 };
        let j = if has_parens { inner.len() - 1 } else { inner.len() };
        let inner_constraint = parse_token_constraint(&inner[i..j])?;
        return Ok(TokenConstraint::Negated(Box::new(inner_constraint)));
    }

    // If we don't have any compounding expressions, just assume it's a simple atom.
    if !(input.contains(" and ") || input.contains(" or ") || input.contains('(')) {
        let atom = parse_token_atom(input)?;
        return Ok(TokenConstraint::Atom(atom));
    }

    // Handle complex expressions.
    // The strategy is to find the top-level operator (if any) and split the
    // expression. We only allow one type of operator (`and` or `or`) at each
    // level of parenthesis to avoid ambiguity.
    let mut paren_level = 0;
    let mut op: Option<TokenConstraintOperation> = None;

    // If the expression is wrapped in a single pair of parentheses, we can
    // effectively parse the inner content.
    let mut effective_input = input.trim();
    while effective_input.starts_with('(') && effective_input.ends_with(')') {
        // Check for balanced parentheses before stripping
        let mut balance = 0;
        let mut fully_wrapped = true;
        for (_i, c) in effective_input.char_indices().skip(1).take(effective_input.len() - 2) {
            if c == '(' {
                balance += 1;
            } else if c == ')' {
                balance -= 1;
            }
            if balance < 0 {
                fully_wrapped = false;
                break;
            }
        }

        if fully_wrapped && balance == 0 {
            effective_input = &effective_input[1..effective_input.len() - 1].trim();
        } else {
            break;
        }
    }

    let mut last_split = 0;
    let mut children_str = vec![];

    for i in 0..effective_input.len() {
        match effective_input.chars().nth(i) {
            Some('(') => paren_level += 1,
            Some(')') => {
                if paren_level == 0 {
                    return Err(QueryParseError::new("Unmatched closing parenthesis"));
                }
                paren_level -= 1;
            }
            Some(' ') if paren_level == 0 => {
                let current_op;
                let op_len;

                if effective_input[i..].starts_with(" and ") {
                    current_op = TokenConstraintOperation::And;
                    op_len = 5; // " and "
                } else if effective_input[i..].starts_with(" or ") {
                    current_op = TokenConstraintOperation::Or;
                    op_len = 4; // " or "
                } else {
                    continue;
                }

                if let Some(ref existing_op) = op {
                    if *existing_op as u8 != current_op as u8 {
                        return Err(QueryParseError::new(
                            "Mixing 'and' and 'or' at the same level is not allowed",
                        ));
                    }
                } else {
                    op = Some(current_op);
                }

                children_str.push(&effective_input[last_split..i]);
                last_split = i + op_len;
            }
            _ => {}
        }
    }

    if paren_level != 0 {
        return Err(QueryParseError::new("Unmatched opening parenthesis"));
    }

    children_str.push(&effective_input[last_split..]);

    if let Some(op) = op {
        let children: Result<Vec<TokenConstraint>, _> = children_str
            .into_iter()
            .map(|s| parse_token_constraint(s))
            .collect();

        Ok(TokenConstraint::Composed {
            op,
            children: children?,
        })
    } else {
        // If no operators were found, it must be a single (potentially parenthesized) atom.
        // The simple atom case at the top of the function should have already handled
        // non-parenthesized atoms.
        let atom = parse_token_atom(effective_input)?;
        Ok(TokenConstraint::Atom(atom))
    }
}


/// Parses a query string into a `Query` object.
///
/// # Overview
///
/// The query syntax is built up from the following simpler
/// building blocks:
///
/// ## Token Atom
///
/// A token atom is is lowest level and represents a constraint on a single
/// token in the search.
///
/// The following syntax is used to define a token atom:
/// - `@lemma:<lemma>`
/// - `@word:<word>` or simply `<word>`. Note that `<word>` can only be
///    composed of characters in the Latin alphabet (a-z, A-Z).
/// - `@case:<case>`, `@tense:<tense>` etc... for each inflection
///    category in `LatinInflection`.
///
/// ### Examples
///
/// - `@lemma:amor`
/// - `@word:amoris`, (or the equivalent but briefer `amoris`)
/// - `@case:genitive`.
///
/// ## Token Constraint
///
/// A token constraint is a tree representing a potentially complex
/// relationship between constraints for one token. The syntax for a token
/// constraint can be as follows:
/// - A plain token atom
/// - `!<token_atom>` or `!(<token-atom>)` or `!(<token-constraint>)` to
///    represent negation.
/// - `(<token-atom> and <token-atom> ... and <token-atom>)` to represent the
///   conjunction of several constraints.
/// - `(<token-atom> or <token-atom> ... or <token-atom>)` to represent the
///   disjunction of several constraints.
///
/// ### Examples
///
/// - `@word:amoris` / `amoris` / `(amoris)`
/// - `!@word:amoris` / `!amoris` / `!(amoris)`
/// - `(@lemma:amoris and @case:genitive)`
/// - `((@lemma:habeo or @lemma:amo) and !@word:amoris)`
///
/// ## Query
///
/// A full query is finally a sequence of token constraints,
/// along with some syntax encoding their relative relationships.
///
/// The following relations are supported:
/// - `<token-constraint-a> <token-constraint-b>` (note the space in the middle)
///   means the matches will contain only those results where we have a token that
///   matches the constraints of A immediately followed by the constraints of B.
/// - `<token-constraint-a> <optional:number K>~ <token-constraint-b>` means the matches
///   will contain only those results where a token that matches A is within K tokens of
///   a token that matches B.
/// - `<token-constraint-a`<optional:number K>~> <token-constraint-b>` means that matches
///   will contain only those results where a token that matches A is within K tokens before a
///   token that matches B.
///
/// There is no bound in the length of the allowed query.
pub fn parse_query(input: &str) -> Result<Query, QueryParseError> {
    unimplemented!();
}

#[cfg(test)]
mod tests {
    use crate::analyzer_types::{LatinCase, LatinGender, LatinMood};

    use super::*;

    //
    // Tests for `parse_relation`
    //
    #[test]
    fn parse_relation_after() {
        assert_eq!(parse_relation("").unwrap(), QueryRelation::After);
        assert_eq!(parse_relation("   ").unwrap(), QueryRelation::After);
    }

    #[test]
    fn parse_relation_proximity() {
        assert_eq!(
            parse_relation("~").unwrap(),
            QueryRelation::Proximity {
                distance: 5,
                is_directed: false
            }
        );
        assert_eq!(
            parse_relation("  ~  ").unwrap(),
            QueryRelation::Proximity {
                distance: 5,
                is_directed: false
            }
        );
    }

    #[test]
    fn parse_relation_directed_proximity() {
        assert_eq!(
            parse_relation("~>").unwrap(),
            QueryRelation::Proximity {
                distance: 5,
                is_directed: true
            }
        );
        assert_eq!(
            parse_relation("  ~>  ").unwrap(),
            QueryRelation::Proximity {
                distance: 5,
                is_directed: true
            }
        );
    }

    #[test]
    fn parse_relation_with_proximity_distance() {
        assert_eq!(
            parse_relation("10~").unwrap(),
            QueryRelation::Proximity {
                distance: 10,
                is_directed: false
            }
        );
        assert_eq!(
            parse_relation("  10~  ").unwrap(),
            QueryRelation::Proximity {
                distance: 10,
                is_directed: false
            }
        );
    }

    #[test]
    fn parse_relation_with_directed_proximity_distance() {
        assert_eq!(
            parse_relation("10~>").unwrap(),
            QueryRelation::Proximity {
                distance: 10,
                is_directed: true
            }
        );
        assert_eq!(
            parse_relation("  10~>  ").unwrap(),
            QueryRelation::Proximity {
                distance: 10,
                is_directed: true
            }
        );
    }

    #[test]
    fn parse_relation_invalid() {
        assert!(parse_relation(">").is_err());
        assert!(parse_relation("<").is_err());
        assert!(parse_relation("~<").is_err());
        assert!(parse_relation("a").is_err());
        assert!(parse_relation("~a").is_err());
        assert!(parse_relation("~ >").is_err());
    }

    //
    // Tests for `parse_token_atom`
    //
    #[test]
    fn parse_token_atom_plain_word() {
        assert_eq!(
            parse_token_atom("amoris").unwrap(),
            TokenConstraintAtom::Word("amoris".to_string())
        );
    }

    #[test]
    fn parse_token_atom_word_prefix() {
        assert_eq!(
            parse_token_atom("@word:amoris").unwrap(),
            TokenConstraintAtom::Word("amoris".to_string())
        );
    }

    #[test]
    fn parse_token_atom_lemma_prefix() {
        assert_eq!(
            parse_token_atom("@lemma:amor").unwrap(),
            TokenConstraintAtom::Lemma("amor".to_string())
        );
    }

    #[test]
    fn parse_token_atom_inflection_case() {
        assert_eq!(
            parse_token_atom("@case:nominative").unwrap(),
            TokenConstraintAtom::Inflection(LatinInflection::Case(LatinCase::Nominative))
        );
    }

    #[test]
    fn parse_token_atom_invalid_nonalpha() {
        assert!(parse_token_atom("amo1").is_err());
    }

    #[test]
    fn parse_token_atom_invalid_inflection() {
        // Unknown inflection label should produce an error
        assert!(parse_token_atom("@unknown:foo").is_err());
    }

    //
    // Tests for `parse_token_constraint`
    //
    #[test]
    fn parse_token_constraint_simple_atom() {
        let expected = TokenConstraint::Atom(TokenConstraintAtom::Word("amoris".to_string()));
        assert_eq!(parse_token_constraint("amoris").unwrap(), expected);
    }

    #[test]
    fn parse_token_constraint_parenthesized_atom() {
        let expected = TokenConstraint::Atom(TokenConstraintAtom::Word("amoris".to_string()));
        assert_eq!(parse_token_constraint("(amoris)").unwrap(), expected);
        assert_eq!(parse_token_constraint("((amoris))").unwrap(), expected);
    }

    #[test]
    fn parse_token_constraint_negated_atom() {
        let expected = TokenConstraint::Negated(Box::new(TokenConstraint::Atom(
            TokenConstraintAtom::Word("amoris".to_string()),
        )));
        assert_eq!(parse_token_constraint("!amoris").unwrap(), expected);
    }

    #[test]
    fn parse_token_constraint_negated_parenthesized_atom() {
        let expected = TokenConstraint::Negated(Box::new(TokenConstraint::Atom(
            TokenConstraintAtom::Word("amoris".to_string()),
        )));
        assert_eq!(parse_token_constraint("!(amoris)").unwrap(), expected);
    }

    #[test]
    fn parse_token_constraint_conjunction() {
        let expected = TokenConstraint::Composed {
            op: TokenConstraintOperation::And,
            children: vec![
                TokenConstraint::Atom(TokenConstraintAtom::Lemma("amor".to_string())),
                TokenConstraint::Atom(TokenConstraintAtom::Inflection(LatinInflection::Case(
                    LatinCase::Genitive,
                ))),
            ],
        };
        assert_eq!(
            parse_token_constraint("(@lemma:amor and @case:genitive)").unwrap(),
            expected
        );
    }

    #[test]
    fn parse_token_constraint_disjunction() {
        let expected = TokenConstraint::Composed {
            op: TokenConstraintOperation::Or,
            children: vec![
                TokenConstraint::Atom(TokenConstraintAtom::Lemma("amor".to_string())),
                TokenConstraint::Atom(TokenConstraintAtom::Lemma("habeo".to_string())),
            ],
        };
        assert_eq!(
            parse_token_constraint("(@lemma:amor or @lemma:habeo)").unwrap(),
            expected
        );
    }

    #[test]
    fn parse_token_constraint_nested() {
        let expected = TokenConstraint::Composed {
            op: TokenConstraintOperation::And,
            children: vec![
                TokenConstraint::Composed {
                    op: TokenConstraintOperation::Or,
                    children: vec![
                        TokenConstraint::Atom(TokenConstraintAtom::Lemma("amor".to_string())),
                        TokenConstraint::Atom(TokenConstraintAtom::Lemma("habeo".to_string())),
                    ],
                },
                TokenConstraint::Atom(TokenConstraintAtom::Inflection(LatinInflection::Case(
                    LatinCase::Genitive,
                ))),
            ],
        };
        assert_eq!(
            parse_token_constraint("((@lemma:amor or @lemma:habeo) and @case:genitive)").unwrap(),
            expected
        );
    }

    #[test]
    fn parse_token_constraint_multiple_nested() {
        let expected = TokenConstraint::Composed {
            op: TokenConstraintOperation::And,
            children: vec![
                TokenConstraint::Composed {
                    op: TokenConstraintOperation::Or,
                    children: vec![
                        TokenConstraint::Atom(TokenConstraintAtom::Lemma("amor".to_string())),
                        TokenConstraint::Atom(TokenConstraintAtom::Lemma("habeo".to_string())),
                    ],
                },
                TokenConstraint::Atom(TokenConstraintAtom::Inflection(LatinInflection::Case(
                    LatinCase::Genitive,
                ))),
                TokenConstraint::Negated(Box::new(TokenConstraint::Composed {
                    op: TokenConstraintOperation::Or,
                    children: vec![
                        TokenConstraint::Atom(TokenConstraintAtom::Inflection(
                            LatinInflection::Mood(LatinMood::Subjunctive),
                        )),
                        TokenConstraint::Atom(TokenConstraintAtom::Inflection(
                            LatinInflection::Gender(LatinGender::Masculine),
                        )),
                    ],
                })),
            ],
        };
        assert_eq!(
            parse_token_constraint("((@lemma:amor or @lemma:habeo) and @case:genitive and !(@mood:subjunctive or @gender:masc))").unwrap(),
            expected
        );
    }

    #[test]
    fn parse_token_constraint_negated_complex() {
        let expected = TokenConstraint::Negated(Box::new(TokenConstraint::Composed {
            op: TokenConstraintOperation::And,
            children: vec![
                TokenConstraint::Atom(TokenConstraintAtom::Lemma("amor".to_string())),
                TokenConstraint::Atom(TokenConstraintAtom::Inflection(LatinInflection::Case(
                    LatinCase::Genitive,
                ))),
            ],
        }));
        assert_eq!(
            parse_token_constraint("!(@lemma:amor and @case:genitive)").unwrap(),
            expected
        );
    }

    #[test]
    fn parse_token_constraint_invalid_mixing_ops() {
        assert!(
            parse_token_constraint("(@lemma:amor and @case:genitive or @word:amoris)").is_err()
        );
    }

    #[test]
    fn parse_token_constraint_unmatched_parens() {
        assert!(parse_token_constraint("((amoris)").is_err());
        assert!(parse_token_constraint("(amoris))").is_err());
    }

    #[test]
    fn parse_token_constraint_empty_input() {
        assert!(parse_token_constraint("").is_err());
        assert!(parse_token_constraint("   ").is_err());
    }
}
