use std::str::FromStr;

use super::analyzer_types::LatinInflection;

const DEFAULT_PROXIMITY: u8 = 5;
const SIMPLE_PREFIXES: [&str; 4] = ["@lemma:", "@word:", "@l:", "@w:"];
/// The fewest fixed letters a wildcard word may have, since shorter affixes
/// match too much of the vocabulary.
const MIN_AFFIX_LETTERS: usize = 3;

/// A query on the corpus.
#[derive(Debug, Clone)]
pub struct Query {
    pub terms: Vec<QueryTerm>,
    /// Authors and/or work IDs the query is restricted to (empty for the whole
    /// corpus), from the `[...]` prefix.
    pub scope: Vec<String>,
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

/// A word with one `*` wildcard. The fixed letters are lowercase.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum AffixPattern {
    Prefix(String),
    Suffix(String),
    PrefixSuffix { prefix: String, suffix: String },
}

impl std::fmt::Display for AffixPattern {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AffixPattern::Prefix(p) => write!(f, "{p}*"),
            AffixPattern::Suffix(s) => write!(f, "*{s}"),
            AffixPattern::PrefixSuffix { prefix, suffix } => write!(f, "{prefix}*{suffix}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenConstraintAtom {
    Word(String),
    Lemma(String),
    Inflection(LatinInflection),
    Affix(AffixPattern),
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
                TokenConstraintAtom::Word(w) => write!(f, "{w}"),
                TokenConstraintAtom::Lemma(l) => write!(f, "@lemma:{l}"),
                TokenConstraintAtom::Inflection(inf) => {
                    write!(f, "@{}:{}", inf.get_label(), inf.get_code())
                }
                TokenConstraintAtom::Affix(pattern) => write!(f, "{pattern}"),
            },
            TokenConstraint::Composed { op, children } => {
                let op_str = match op {
                    TokenConstraintOperation::And => " and ",
                    TokenConstraintOperation::Or => " or ",
                };
                let child_strs: Vec<String> = children.iter().map(|c| c.to_string()).collect();
                write!(f, "({})", child_strs.join(op_str))
            }
            TokenConstraint::Negated(inner) => write!(f, "!({inner})"),
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

fn is_valid_lemma(s: &str) -> bool {
    let mut chars = s.chars().rev();
    let has_number = match chars.next() {
        // Empty string is not valid
        None => return false,
        Some(c) => c.is_ascii_digit(),
    };
    if has_number {
        loop {
            match chars.next() {
                // This means we ended with just numbers.
                None => return false,
                // This ends the number suffix.
                Some('#') => break,
                Some(c) if c.is_ascii_digit() => continue,
                // We got some unexpected character here.
                _ => return false,
            }
        }
    }
    // Everything else should be alphabetic.
    chars.all(|c| c.is_ascii_alphabetic())
}

fn parse_affix(raw: &str) -> Result<AffixPattern, QueryParseError> {
    let Some((prefix, suffix)) = raw.split_once('*') else {
        return Err(QueryParseError::new(&format!("'{raw}' has no wildcard")));
    };
    if suffix.contains('*') {
        return Err(QueryParseError::new(&format!(
            "Wildcard '{raw}' has more than one '*': use at most one per word \
             (infix wildcards like '*mor*' are not supported)"
        )));
    }
    if prefix.is_empty() && suffix.is_empty() {
        return Err(QueryParseError::new(&format!(
            "A wildcard must include at least {MIN_AFFIX_LETTERS} letters"
        )));
    }
    if !prefix
        .chars()
        .chain(suffix.chars())
        .all(|c| c.is_ascii_alphabetic())
    {
        return Err(QueryParseError::new(&format!(
            "Wildcard '{raw}' may only contain Latin letters (a-z) and '*'"
        )));
    }
    if prefix.len() + suffix.len() < MIN_AFFIX_LETTERS {
        return Err(QueryParseError::new(&format!(
            "Wildcard '{raw}' is too short: use at least {MIN_AFFIX_LETTERS} letters"
        )));
    }
    let (prefix, suffix) = (prefix.to_ascii_lowercase(), suffix.to_ascii_lowercase());
    Ok(if suffix.is_empty() {
        AffixPattern::Prefix(prefix)
    } else if prefix.is_empty() {
        AffixPattern::Suffix(suffix)
    } else {
        AffixPattern::PrefixSuffix { prefix, suffix }
    })
}

fn wildcard_tag_error(tag: &str) -> QueryParseError {
    QueryParseError::new(&format!(
        "Wildcards ('*') are only supported for words, not {tag}"
    ))
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
        if content.contains('*') {
            return match *simple_prefix {
                "@w:" | "@word:" => Ok(TokenConstraintAtom::Affix(parse_affix(&content)?)),
                _ => Err(wildcard_tag_error("@lemma")),
            };
        }
        if !is_valid_lemma(&content) {
            return Err(QueryParseError::new("Token atom must be alphabetic"));
        }
        match *simple_prefix {
            "@l:" | "@lemma:" => return Ok(TokenConstraintAtom::Lemma(content.to_string())),
            "@w:" | "@word:" => return Ok(TokenConstraintAtom::Word(content.to_string())),
            _ => unreachable!(), // We only have two prefixes defined
        }
    }

    if let Some(inflection_str) = input.strip_prefix('@') {
        if inflection_str.contains('*') {
            let tag = inflection_str.split(':').next().unwrap_or_default();
            return Err(wildcard_tag_error(&format!("@{tag}")));
        }
        // Handle inflection categories
        if let Ok(inflection) = LatinInflection::from_str(inflection_str) {
            return Ok(TokenConstraintAtom::Inflection(inflection));
        } else {
            return Err(QueryParseError::new("Invalid inflection category"));
        }
    }

    if input.contains('*') {
        return Ok(TokenConstraintAtom::Affix(parse_affix(input)?));
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
    if input.is_empty() {
        return Ok(QueryRelation::After);
    }
    let (leading, is_directed) = if let Some(leading) = input.strip_suffix("~>") {
        (leading, true)
    } else if let Some(leading) = input.strip_suffix('~') {
        (leading, false)
    } else {
        return Err(QueryParseError::new(""));
    };
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
        // Byte offsets: the parentheses are one byte each.
        let n = effective_input.len();
        for c in effective_input[1..n - 1].chars() {
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

    for (i, c) in effective_input.char_indices() {
        match c {
            '(' => paren_level += 1,
            ')' => {
                if paren_level == 0 {
                    return Err(QueryParseError::new("Unmatched closing parenthesis"));
                }
                paren_level -= 1;
            }
            ' ' if paren_level == 0 => {
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

// The term splitting below works on byte offsets, which is safe because every
// delimiter (`!`, `@`, `(`, `)`, `*`, ` `) is one byte.

/// Returns the byte offset of the close parenthesis for the open one at `open_idx`.
fn find_close_paren(input: &str, open_idx: usize) -> Result<usize, QueryParseError> {
    check_equal!(
        input.get(open_idx..).and_then(|rest| rest.chars().next()),
        Some('('),
        "Expected '('"
    );
    let mut balance = 1;
    for (i, c) in input[open_idx + 1..].char_indices() {
        if c == '(' {
            balance += 1;
        } else if c == ')' {
            balance -= 1;
            if balance == 0 {
                return Ok(open_idx + 1 + i);
            }
        }
    }
    Err(QueryParseError::new("Unmatched opening parenthesis"))
}

/// Returns the (exclusive) byte offset of the end of the word starting at
/// `start_idx`: the next space, or the end of the string.
fn find_word_end(input: &str, start_idx: usize) -> usize {
    input
        .get(start_idx..)
        .and_then(|rest| rest.find(' '))
        .map_or(input.len(), |k| start_idx + k)
}

/// Finds the byte offset of the start of the next constraint, searching from
/// the start of `input`, or after the character at `after`. A constraint
/// starts with `!`, `(`, `@`, `*`, or a letter (non-ASCII letters too, so they
/// get a clear error when the term is parsed).
fn find_next_constraint(input: &str, after: Option<usize>) -> Option<usize> {
    let (from, skip) = match after {
        None => (0, 0),
        Some(i) => (i, 1),
    };
    input
        .get(from..)?
        .char_indices()
        .skip(skip)
        .find(|&(_, c)| matches!(c, '!' | '@' | '(' | '*') || c.is_alphabetic())
        .map(|(i, _)| from + i)
}

/// Splits the query into terms.
fn split_query(raw_input: &str) -> Result<(Vec<String>, Vec<String>), QueryParseError> {
    let input = raw_input.trim();
    let n = input.len();

    let mut constraints: Vec<String> = Vec::new();
    let mut relations: Vec<String> = Vec::new();
    let mut i =
        find_next_constraint(input, None).ok_or(QueryParseError::new("No constraints!."))?;
    check_equal!(i, 0, raw_input);
    let mut splits = 0;

    while i < n {
        if splits % 2 != 0 {
            let end = find_next_constraint(input, Some(i))
                .ok_or(QueryParseError::new("Unexpected end of query."))?;
            relations.push(input[i..end].to_string());
            i = end;
            splits += 1;
            continue;
        }
        let start = i;
        // If we have negation, skip that and try the next character.
        if input[i..].starts_with('!') {
            i += 1;
        }
        i = match input[i..].chars().next() {
            Some('(') => find_close_paren(input, i)? + 1,
            Some('@') | Some('*') => find_word_end(input, i),
            Some(c) if c.is_alphabetic() => find_word_end(input, i),
            _ => {
                return Err(QueryParseError::new("Unexpected character in query."));
            }
        };
        constraints.push(input[start..i].to_string());
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
/// - A word with one `*` wildcard and at least 3 letters: `con*` (prefix),
///   `*que` (suffix), or `in*bilis` (both). Also allowed after `@word:`, but
///   not on lemmata or inflections.
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
/// A query may be preceded by a scope in square brackets: a comma-separated list
/// of authors and/or work IDs. For example, `[Cicero, Caesar] @lemma:amor`
/// restricts the search to works by Cicero or Caesar, and
/// `[phi0690.phi003.perseus-lat2] arma` to the Aeneid.
pub fn parse_query(input: &str) -> Result<Query, QueryParseError> {
    let (query_body, scope) = parse_scope_prefix(input)?;
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
    Ok(Query { terms, scope })
}

fn parse_scope_prefix(input: &str) -> Result<(&str, Vec<String>), QueryParseError> {
    let trimmed = input.trim_start();
    if !trimmed.starts_with('[') {
        return Ok((trimmed, Vec::new()));
    }

    let close_idx = trimmed[1..]
        .find(']')
        .ok_or_else(|| QueryParseError::new("Missing closing ']' in scope list"))?
        + 1;

    let scope_segment = trimmed[1..close_idx].trim();
    let scope: Vec<String> = scope_segment
        .split(',')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .collect();

    if scope.is_empty() {
        return Err(QueryParseError::new("Scope list cannot be empty"));
    }

    let remainder = trimmed[close_idx + 1..].trim_start();

    Ok((remainder, scope))
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
    fn parse_query_with_scope_prefix() {
        let query = parse_query("[Cicero, Caesar] @lemma:amor").unwrap();
        assert_eq!(
            query.scope,
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

    //
    // Tests for wildcards
    //
    fn affix(pattern: AffixPattern) -> TokenConstraint {
        TokenConstraint::Atom(TokenConstraintAtom::Affix(pattern))
    }

    fn prefix(p: &str) -> AffixPattern {
        AffixPattern::Prefix(p.to_string())
    }

    fn suffix(s: &str) -> AffixPattern {
        AffixPattern::Suffix(s.to_string())
    }

    fn atom_error(input: &str) -> String {
        parse_token_atom(input).unwrap_err().message
    }

    fn query_error(input: &str) -> String {
        parse_query(input).unwrap_err().message
    }

    #[test]
    fn parse_wildcard_atoms() {
        let parsed = |input: &str| match parse_token_atom(input).unwrap() {
            TokenConstraintAtom::Affix(pattern) => pattern,
            other => panic!("{input} parsed as {other:?}"),
        };
        assert_eq!(parsed("con*"), prefix("con"));
        assert_eq!(parsed("CON*"), prefix("con"));
        assert_eq!(parsed("*que"), suffix("que"));
        assert_eq!(parsed("*QuE"), suffix("que"));
        assert_eq!(
            parsed("In*Bilis"),
            AffixPattern::PrefixSuffix {
                prefix: "in".to_string(),
                suffix: "bilis".to_string()
            }
        );
        assert_eq!(parsed("a*bc"), parsed("@word:a*bc"));
        assert_eq!(parsed("@word:con*"), prefix("con"));
        assert_eq!(parsed("@w:*que"), suffix("que"));
        assert_eq!(parsed("@word:in*bilis"), parsed("in*bilis"));
    }

    #[test]
    fn display_wildcards() {
        assert_eq!(prefix("con").to_string(), "con*");
        assert_eq!(suffix("que").to_string(), "*que");
        assert_eq!(
            AffixPattern::PrefixSuffix {
                prefix: "in".to_string(),
                suffix: "bilis".to_string()
            }
            .to_string(),
            "in*bilis"
        );
        let query = parse_query("(*que or @w:Tio*)").unwrap();
        assert_eq!(query.terms[0].constraint.to_string(), "(*que or tio*)");
    }

    #[test]
    fn parse_queries_with_wildcards() {
        let query = parse_query("*que").unwrap();
        assert_eq!(query.terms.len(), 1);
        assert_eq!(query.terms[0].constraint, affix(suffix("que")));

        let query = parse_query("!*que").unwrap();
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Negated(Box::new(affix(suffix("que"))))
        );

        let query = parse_query("(*que or *tio)").unwrap();
        assert_eq!(
            query.terms[0].constraint,
            TokenConstraint::Composed {
                op: TokenConstraintOperation::Or,
                children: vec![affix(suffix("que")), affix(suffix("tio"))],
            }
        );

        let query = parse_query("arma ~ *que").unwrap();
        assert_eq!(query.terms.len(), 2);
        assert_eq!(query.terms[1].constraint, affix(suffix("que")));
        assert_eq!(
            query.terms[1].relation,
            QueryRelation::Proximity {
                distance: 5,
                is_directed: false
            }
        );

        let query = parse_query("arma 3~> *que con*").unwrap();
        assert_eq!(query.terms.len(), 3);
        assert_eq!(
            query.terms[1].relation,
            QueryRelation::Proximity {
                distance: 3,
                is_directed: true
            }
        );
        assert_eq!(query.terms[2].constraint, affix(prefix("con")));
        assert_eq!(query.terms[2].relation, QueryRelation::After);

        let query = parse_query("[Caesar] *que").unwrap();
        assert_eq!(query.scope, vec!["Caesar".to_string()]);
        assert_eq!(query.terms[0].constraint, affix(suffix("que")));
    }

    #[test]
    fn wildcard_needs_letters() {
        for input in ["*", "@word:*", "@w:*"] {
            assert!(atom_error(input).contains("at least 3 letters"), "{input}");
        }
        assert!(query_error("*").contains("at least 3 letters"));
        assert!(query_error("arma *").contains("at least 3 letters"));
    }

    #[test]
    fn wildcard_allows_one_star() {
        for input in ["*mor*", "a*b*c", "**que", "con**", "@word:*mor*"] {
            assert!(atom_error(input).contains("more than one '*'"), "{input}");
        }
        assert!(query_error("*mor*").contains("more than one '*'"));
    }

    #[test]
    fn wildcard_needs_three_letters() {
        for input in ["in*", "*um", "a*b", "ab*", "@w:a*b"] {
            assert!(atom_error(input).contains("too short"), "{input}");
        }
        assert!(query_error("arma in*").contains("too short"));
    }

    #[test]
    fn wildcard_allows_only_latin_letters() {
        for input in ["con1*", "bell-*", "ē*", "*quē", "@word:a1*bc"] {
            assert!(
                atom_error(input).contains("may only contain Latin letters"),
                "{input}"
            );
        }
        assert!(query_error("ē*").contains("may only contain Latin letters"));
        assert!(query_error("arma ē*").contains("may only contain Latin letters"));
    }

    #[test]
    fn wildcard_only_on_words() {
        for input in ["@lemma:con*", "@l:*fico", "@lemma:*"] {
            assert_eq!(
                atom_error(input),
                "Wildcards ('*') are only supported for words, not @lemma",
                "{input}"
            );
        }
        assert_eq!(
            atom_error("@case:a*"),
            "Wildcards ('*') are only supported for words, not @case"
        );
        assert_eq!(
            atom_error("@tense:*"),
            "Wildcards ('*') are only supported for words, not @tense"
        );
        assert!(query_error("arma @lemma:con*").contains("not @lemma"));
    }

    #[test]
    fn multibyte_characters_never_split_mid_codepoint() {
        let latin_only = "may only contain Latin letters";
        for query in [
            "(*quē)",
            "(ē*)",
            "(*quē or con*)",
            "(ē* or con*)",
            "(*tio) (*quē) con*",
            "ē* arma",
            "arma ~ (con* and *quē)",
        ] {
            assert!(query_error(query).contains(latin_only), "{query}");
        }
        assert!(query_error("arma aa—~ *que").contains("Invalid token atom"));
        assert!(query_error("(quē)").contains("Invalid token atom"));
        assert_eq!(
            parse_relation(" —~ ").unwrap(),
            QueryRelation::Proximity {
                distance: DEFAULT_PROXIMITY,
                is_directed: false
            }
        );
        let query = parse_query("(*tio) (*que) con*").unwrap();
        assert_eq!(query.terms.len(), 3);
        assert_eq!(query.terms[2].constraint, affix(prefix("con")));
    }

    #[test]
    fn parse_query_never_panics() {
        const PIECES: &[&str] = &[
            "ē", "—", "(", ")", "*", "~", "~>", " ", "a", "que", "!", "@w:", " and ", " or ", "3",
            "[", "]",
        ];
        let mut queries = vec![String::new()];
        for _ in 0..4 {
            queries = queries
                .iter()
                .flat_map(|q| PIECES.iter().map(move |p| format!("{q}{p}")))
                .collect();
            for query in &queries {
                let _ = parse_query(query);
            }
        }
    }
}
