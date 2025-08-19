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

#[derive(Debug, Clone)]
pub enum TokenConstraintOperation {
    And,
    Or,
}

/// Represents a constraint for one token in the query language.
#[derive(Debug, Clone)]
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
    use crate::analyzer_types::LatinCase;

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
}
