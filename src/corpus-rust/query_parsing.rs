use crate::corpus_query_engine::{
    ComposedQuery, CorpusQuery, CorpusQueryAtom, CorpusQueryPart, InflectionQuery, LemmaQuery,
    QueryToken, WordQuery,
};
use regex::Regex;

fn parse_query_atom(atom_str: &str) -> CorpusQueryAtom {
    let parts: Vec<&str> = atom_str.splitn(2, ':').collect();
    let key = parts[0];
    let value = parts.get(1).map_or("", |v| *v);

    match key {
        "word" => CorpusQueryAtom::Word(WordQuery {
            word: value.to_string(),
        }),
        "lemma" => CorpusQueryAtom::Lemma(LemmaQuery {
            lemma: value.to_string(),
        }),
        _ => CorpusQueryAtom::Inflection(InflectionQuery {
            category: key.to_string(),
            value: value.to_string(),
        }),
    }
}

pub fn parse_query(query_str: &str) -> CorpusQuery {
    let part_regex = Regex::new(r"\[([^\]]+)\]").unwrap();
    let mut parts: Vec<CorpusQueryPart> = Vec::new();

    for cap in part_regex.captures_iter(query_str) {
        let part_content = cap[1].trim();
        let compositions = ["and"]; // Currently only "and" is supported
        let mut handled = false;

        for composition in &compositions {
            let splitter = format!(" {} ", composition);
            if part_content.contains(&splitter) {
                let atoms = part_content
                    .split(&splitter)
                    .map(parse_query_atom)
                    .collect();
                parts.push(CorpusQueryPart {
                    token: QueryToken::Composed(ComposedQuery {
                        atoms,
                        composition: (*composition).to_string(),
                    }),
                });
                handled = true;
                break;
            }
        }

        if !handled {
            parts.push(CorpusQueryPart {
                token: QueryToken::Atom(parse_query_atom(part_content)),
            });
        }
    }

    CorpusQuery { parts }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_query() {
        let query_str = "[word:arma] [lemma:virumque]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 2);
        if let QueryToken::Atom(CorpusQueryAtom::Word(wq)) = &query.parts[0].token {
            assert_eq!(wq.word, "arma");
        } else {
            panic!("Expected WordQuery");
        }
        if let QueryToken::Atom(CorpusQueryAtom::Lemma(lq)) = &query.parts[1].token {
            assert_eq!(lq.lemma, "virumque");
        } else {
            panic!("Expected LemmaQuery");
        }
    }

    #[test]
    fn test_parse_composed_query() {
        let query_str = "[case:1 and gender:1]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 1);
        if let QueryToken::Composed(cq) = &query.parts[0].token {
            assert_eq!(cq.composition, "and");
            assert_eq!(cq.atoms.len(), 2);
            if let CorpusQueryAtom::Inflection(iq) = &cq.atoms[0] {
                assert_eq!(iq.category, "case");
                assert_eq!(iq.value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
            if let CorpusQueryAtom::Inflection(iq) = &cq.atoms[1] {
                assert_eq!(iq.category, "gender");
                assert_eq!(iq.value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
        } else {
            panic!("Expected ComposedQuery");
        }
    }

    #[test]
    fn test_parse_mixed_query() {
        let query_str = "[word:test] [lemma:foo and case:2]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 2);

        if let QueryToken::Atom(CorpusQueryAtom::Word(wq)) = &query.parts[0].token {
            assert_eq!(wq.word, "test");
        } else {
            panic!("Expected WordQuery");
        }

        if let QueryToken::Composed(cq) = &query.parts[1].token {
            assert_eq!(cq.composition, "and");
            assert_eq!(cq.atoms.len(), 2);
            if let CorpusQueryAtom::Lemma(lq) = &cq.atoms[0] {
                assert_eq!(lq.lemma, "foo");
            } else {
                panic!("Expected LemmaQuery");
            }
            if let CorpusQueryAtom::Inflection(iq) = &cq.atoms[1] {
                assert_eq!(iq.category, "case");
                assert_eq!(iq.value, "2");
            } else {
                panic!("Expected InflectionQuery");
            }
        } else {
            panic!("Expected ComposedQuery");
        }
    }

    #[test]
    fn test_parse_empty_query() {
        let query_str = "";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 0);
    }

    #[test]
    fn test_parse_query_with_extra_spaces() {
        let query_str = "  [ word:spaced ]  [lemma:out] ";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 2);
        if let QueryToken::Atom(CorpusQueryAtom::Word(wq)) = &query.parts[0].token {
            assert_eq!(wq.word, "spaced");
        } else {
            panic!("Expected WordQuery");
        }
    }
}
