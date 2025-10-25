use std::str::FromStr;

use super::analyzer_types::LatinInflection;

const DEFAULT_PROXIMITY: u8 = 5;
const SIMPLE_PREFIXES: [&str; 4] = ["@lemma:", "@word:", "@l:", "@w:"];

/// A query on the corpus.
#[derive(Debug, Clone)]
pub struct Query {
    pub terms: Vec<QueryTerm>,
    pub authors: Vec<String>,
}

/// An error that occurs while parsing a query.
#[derive(Debug, Clone)]
pub struct QueryParseError {
    pub message: String,
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

impl std::fmt::Display for QueryRelation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QueryRelation::After => write!(f, " "),
            QueryRelation::First => write!(f, ""),
            QueryRelation::Proximity {
                distance,
                is_directed,
            } => write!(f, " {}~{} ", distance, if *is_directed { ">" } else { "" }),
        }
    }
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

impl std::fmt::Display for TokenConstraint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenConstraint::Atom(atom) => match atom {
                TokenConstraintAtom::Word(w) => write!(f, "{}", w),
                TokenConstraintAtom::Lemma(l) => write!(f, "@lemma:{}", l),
                TokenConstraintAtom::Inflection(inf) => {
                    write!(f, "@{}:{}", inf.get_label(), inf.get_code())
                }
            },
            TokenConstraint::Composed { op, children } => {
                let op_str = match op {
                    TokenConstraintOperation::And => " and ",
                    TokenConstraintOperation::Or => " or ",
                };
                let child_strs: Vec<String> = children.iter().map(|c| c.to_string()).collect();
                write!(f, "({})", child_strs.join(op_str))
            }
            TokenConstraint::Negated(inner) => write!(f, "!({})", inner),
        }
    }
}

macro_rules! check_equal {
    (
        $first:expr,
        $second:expr,
        $message:expr
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
        let content = input
            .chars()
            .skip(simple_prefix.chars().count())
            .collect::<String>();
        if content.is_empty() {
            return Err(QueryParseError::new("Empty token atom not allowed"));
        }
        if !content.chars().all(|c| c.is_ascii_alphabetic()) {
            return Err(QueryParseError::new("Token atom must be alphabetic"));
        }
        match *simple_prefix {
            "@l:" | "@lemma:" => return Ok(TokenConstraintAtom::Lemma(content.to_string())),
            "@w:" | "@word:" => return Ok(TokenConstraintAtom::Word(content.to_string())),
            _ => unreachable!(), // We only have two prefixes defined
        }
    }

    if let Some(inflection_str) = input.strip_prefix('@') {
        // Handle inflection categories
        if let Ok(inflection) = LatinInflection::from_str(inflection_str) {
            return Ok(TokenConstraintAtom::Inflection(inflection));
        } else {
            return Err(QueryParseError::new("Invalid inflection category"));
        }
    }

    // Default to word for plain text that matches Latin alphabet
    if input.chars().all(|c| c.is_ascii_alphabetic()) && !input.is_empty() {
        return Ok(TokenConstraintAtom::Word(input.to_string()));
    }

    Err(QueryParseError::new(&format!(
        "Invalid token atom: {input}"
    )))
}

fn parse_relation(raw_input: &str) -> Result<QueryRelation, QueryParseError> {
    let input = raw_input.trim();
    let n = input.chars().count();
    if n == 0 {
        return Ok(QueryRelation::After);
    }

    if n == 1 {
        check_equal!(input.chars().next(), Some('~'), "");
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
    Ok(QueryRelation::Proximity {
        distance,
        is_directed,
    })
}

/// Parse a token constraint (potentially complex with AND/OR/NOT operations)
fn parse_token_constraint(input: &str) -> Result<TokenConstraint, QueryParseError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(QueryParseError::new("Empty token constraint"));
    }

    // Handle negation using recursion.
    if let Some(inner) = input.strip_prefix('!').map(|s| s.trim()) {
        let has_parens = inner.starts_with('(') && inner.ends_with(')');
        let n = inner.chars().count();
        let i = if has_parens { 1 } else { 0 };
        let j = if has_parens { n - 1 } else { n };
        let substr = inner.chars().skip(i).take(j - i).collect::<String>();
        let inner_constraint = parse_token_constraint(&substr)?;
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
        let n = effective_input.chars().count();
        for (_i, c) in effective_input.char_indices().skip(1).take(n - 2) {
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
            effective_input = effective_input[1..n - 1].trim();
        } else {
            break;
        }
    }

    let mut last_split = 0;
    let mut children_str = vec![];

    for i in 0..effective_input.chars().count() {
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
            .map(parse_token_constraint)
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

/// Returns the index of the close parenthesis for the given open parenthesis.
fn find_close_paren(input: &str, open_idx: usize) -> Result<usize, QueryParseError> {
    check_equal!(input.chars().nth(open_idx), Some('('), "Expected '('");
    let mut balance = 1;
    for (i, c) in input.char_indices().skip(open_idx + 1) {
        if c == '(' {
            balance += 1;
        } else if c == ')' {
            balance -= 1;
            if balance == 0 {
                return Ok(i);
            }
        }
    }
    Err(QueryParseError::new("Unmatched opening parenthesis"))
}

/// Returns the index of the end of the "word" starting at the `start_idx`.
/// This is defined as the last character before a space or the end of the string.
fn find_word_end(input: &str, start_idx: usize) -> usize {
    let n = input.chars().count();
    if start_idx >= n {
        return n;
    }
    for (char_idx, c) in input.chars().enumerate().skip(start_idx) {
        if c == ' ' {
            return char_idx - 1;
        }
    }
    n - 1
}

/// Finds the start of the next constraint after `start_idx`.
/// This is defined as the first `!`, `(`, `@`, or alphabet letter.
fn find_next_constraint(input: &str, start_idx: isize) -> Option<usize> {
    if start_idx < -1 {
        return None;
    }
    for (i, c) in input.char_indices().skip((start_idx + 1) as usize) {
        match c {
            '!' | '@' | '(' | 'a'..='z' | 'A'..='Z' => return Some(i),
            _ => {}
        }
    }
    None
}

/// Splits the query into terms.
fn split_query(raw_input: &str) -> Result<(Vec<String>, Vec<String>), QueryParseError> {
    let input = raw_input.trim();
    let n = input.chars().count();

    let mut constraints: Vec<String> = Vec::new();
    let mut relations: Vec<String> = Vec::new();
    let mut i = find_next_constraint(input, -1).ok_or(QueryParseError::new("No constraints!."))?;
    check_equal!(i, 0, raw_input);
    let mut splits = 0;

    while i < n {
        if splits % 2 != 0 {
            let end = find_next_constraint(input, i as isize)
                .ok_or(QueryParseError::new("Unexpected end of query."))?;
            relations.push(input.chars().skip(i).take(end - i).collect());
            i = end;
            splits += 1;
            continue;
        }
        let start = i;
        // If we have negation, skip that and try the next character.
        if input.chars().nth(i) == Some('!') {
            i += 1;
        }
        let c = input.chars().nth(i);
        match c {
            Some('(') => {
                i = find_close_paren(input, i)?;
            }
            Some('@') => {
                i = find_word_end(input, i);
            }
            Some(c) if c.is_alphabetic() => {
                i = find_word_end(input, i);
            }
            _ => {
                return Err(QueryParseError::new("Unexpected character in query."));
            }
        }
        i += 1;
        constraints.push(input.chars().skip(start).take(i - start).collect());
        splits += 1;
    }
    Ok((constraints, relations))
}

/// Parses a query string into a `Query` object.
///
/// ## Overview
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
///   composed of characters in the Latin alphabet (a-z, A-Z).
/// - `@case:<case>`, `@tense:<tense>` etc... for each inflection
///   category in `LatinInflection`.
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
///   represent negation.
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
/// A full query is a sequence of token constraints,
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
///
/// A query may be preceded by a list of authors in square brackets.
/// For example, `[Cicero, Caesar] @lemma:amor` will restrict the search to works
/// by Cicero or Caesar.
pub fn parse_query(input: &str) -> Result<Query, QueryParseError> {
    let (query_body, authors) = parse_author_prefix(input)?;
    let (constraints, relations) = split_query(query_body)?;
    let n = constraints.len();
    check_equal!(n, relations.len() + 1, "Unexpected query split");
    let mut terms: Vec<QueryTerm> = vec![];
    terms.push(QueryTerm {
        constraint: parse_token_constraint(&constraints[0])?,
        relation: QueryRelation::First,
    });
    for i in 1..n {
        terms.push(QueryTerm {
            constraint: parse_token_constraint(&constraints[i])?,
            relation: parse_relation(&relations[i - 1])?,
        });
    }
    Ok(Query { terms, authors })
}

fn parse_author_prefix(input: &str) -> Result<(&str, Vec<String>), QueryParseError> {
    let trimmed = input.trim_start();
    if !trimmed.starts_with('[') {
        return Ok((trimmed, Vec::new()));
    }

    let close_idx = trimmed[1..]
        .find(']')
        .ok_or_else(|| QueryParseError::new("Missing closing ']' in author list"))?
        + 1;

    let authors_segment = trimmed[1..close_idx].trim();
    let authors: Vec<String> = authors_segment
        .split(',')
        .map(|author| author.trim())
        .filter(|author| !author.is_empty())
        .map(|author| author.to_string())
        .collect();

    if authors.is_empty() {
        return Err(QueryParseError::new("Author list cannot be empty"));
    }

    let remainder = trimmed[close_idx + 1..].trim_start();

    Ok((remainder, authors))
}

#[cfg(test)]
mod tests {

    use morceus::inflection_data::{LatinCase, LatinGender, LatinMood};

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

    //
    // Tests for `parse_query`
    //
    #[test]
    fn parse_query_single_term() {
        let query = parse_query("amoris").unwrap();
        assert_eq!(query.terms.len(), 1);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("amoris".to_string()))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
    }

    #[test]
    fn parse_query_two_terms_after() {
        let query = parse_query("amor est").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("amor".to_string()))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(query.terms[1].relation, QueryRelation::After);
    }

    #[test]
    fn parse_query_proximity() {
        let query = parse_query("amor 10~> est").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("amor".to_string()))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(
            query.terms[1].relation,
            QueryRelation::Proximity {
                distance: 10,
                is_directed: true
            }
        );
    }

    #[test]
    fn parse_query_complex() {
        let query = parse_query(
            "(@lemma:amo or @lemma:habeo) 10~ (@case:genitive and !@gender:neuter) ~> est",
        )
        .unwrap();
        assert_eq!(query.terms.len(), 3);

        // Term 1
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Composed {
                op: TokenConstraintOperation::Or,
                children: vec![
                    TokenConstraint::Atom(TokenConstraintAtom::Lemma("amo".to_string())),
                    TokenConstraint::Atom(TokenConstraintAtom::Lemma("habeo".to_string())),
                ]
            }
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);

        // Term 2
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Composed {
                op: TokenConstraintOperation::And,
                children: vec![
                    TokenConstraint::Atom(TokenConstraintAtom::Inflection(LatinInflection::Case(
                        LatinCase::Genitive
                    ))),
                    TokenConstraint::Negated(Box::new(TokenConstraint::Atom(
                        TokenConstraintAtom::Inflection(LatinInflection::Gender(
                            LatinGender::Neuter
                        ))
                    )))
                ]
            }
        );
        assert_eq!(
            query.terms[1].relation,
            QueryRelation::Proximity {
                distance: 10,
                is_directed: false
            }
        );

        // Term 3
        assert_eq!(
            query.terms[2].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(
            query.terms[2].relation,
            QueryRelation::Proximity {
                distance: 5,
                is_directed: true
            }
        );
    }

    #[test]
    fn parse_query_invalid_trailing_relation() {
        assert!(parse_query("amor est ~").is_err());
    }

    #[test]
    fn parse_query_invalid_leading_relation() {
        assert!(parse_query("~ amor est").is_err());
    }

    #[test]
    fn parse_query_invalid_between_relation() {
        assert!(parse_query("amor\test").is_err());
    }

    #[test]
    fn parse_query_with_nested_parens() {
        let query = parse_query("((@lemma:amo)) est").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Lemma("amo".to_string()))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(query.terms[1].relation, QueryRelation::After);
    }

    #[test]
    fn parse_query_negated_atom_no_parens() {
        let query = parse_query("!@case:genitive est").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Negated(Box::new(TokenConstraint::Atom(
                TokenConstraintAtom::Inflection(LatinInflection::Case(LatinCase::Genitive))
            )))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(query.terms[1].relation, QueryRelation::After);
    }

    #[test]
    fn parse_query_negated_atom_with_parens() {
        let query = parse_query("!(@case:genitive) est").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Negated(Box::new(TokenConstraint::Atom(
                TokenConstraintAtom::Inflection(LatinInflection::Case(LatinCase::Genitive))
            )))
        );
        assert_eq!(query.terms[0].relation, QueryRelation::First);
        assert_eq!(
            query.terms[1].constraint,
            TokenConstraint::Atom(TokenConstraintAtom::Word("est".to_string()))
        );
        assert_eq!(query.terms[1].relation, QueryRelation::After);
    }

    #[test]
    fn parse_query_with_authors_prefix() {
        let query = parse_query("[Cicero, Caesar] @lemma:amor").unwrap();
        assert_eq!(
            query.authors,
            vec!["Cicero".to_string(), "Caesar".to_string()]
        );
        assert_eq!(query.terms.len(), 1);
    }

    #[test]
    fn parse_query_invalid_author_not_prefix() {
        assert!(parse_query("@lemma:amor [Cicero]").is_err());
    }

    #[test]
    fn parse_query_invalid_author_missing_bracket() {
        assert!(parse_query("[Cicero @lemma:amor").is_err());
    }
}
