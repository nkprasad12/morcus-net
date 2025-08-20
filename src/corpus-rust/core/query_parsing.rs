use crate::corpus_query_engine::{
    ComposedQuery, CorpusQuery, CorpusQueryAtom, CorpusQueryPart, QueryToken,
};

const COMPOSITIONS: [&str; 2] = ["and", "or"];

fn parse_query_atom(atom_str: &str) -> CorpusQueryAtom {
    let parts: Vec<&str> = atom_str.splitn(2, ':').collect();
    let key = parts[0];
    let value = parts.get(1).map_or("", |v| *v);

    match key {
        "word" => CorpusQueryAtom::Word(value.to_string()),
        "lemma" => CorpusQueryAtom::Lemma(value.to_string()),
        _ => CorpusQueryAtom::Inflection {
            category: key.to_string(),
            value: value.to_string(),
        },
    }
}

pub fn parse_query(query_str: &str) -> CorpusQuery {
    let mut parts: Vec<CorpusQueryPart> = Vec::new();
    let mut in_segment = false;
    let mut current = String::new();
    for c in query_str.trim().chars() {
        // If it's not an opening or closing bracket, just accumulate the character.
        if c != ']' && c != '[' {
            current.push(c);
            continue;
        }
        // If we have an open, check that we don't have anything accumulated.
        if c == '[' {
            if in_segment {
                panic!("Nested segments are not allowed in query: {}", query_str);
            }
            if !current.trim().is_empty() {
                panic!("Found unexpected text before segment start: {}", current);
            }
            in_segment = true;
            continue;
        }
        // If we have a close, we must be in a segment.
        assert_eq!(c, ']');
        if !in_segment {
            panic!("Found segment end without a start: {}", query_str);
        }
        let mut chunks = vec![current.trim().to_string()];
        current = "".to_string();
        in_segment = false;
        // Split on all of the compositions, ensuring that only one type is used.
        let mut composer_found = None;
        for composer in COMPOSITIONS {
            let mut new_chunks = Vec::new();
            for chunk in chunks {
                let parts = chunk
                    .split(&format!(" {} ", composer))
                    .collect::<Vec<&str>>();
                if parts.len() == 1 {
                    new_chunks.push(parts[0].to_string());
                    continue;
                }
                if composer_found.is_some() && composer_found != Some(composer) {
                    panic!("Multiple compositions found in segment: {}", chunk);
                }
                composer_found = Some(composer);
                for part in parts {
                    new_chunks.push(part.to_string());
                }
            }
            chunks = new_chunks;
        }
        if composer_found.is_some() {
            parts.push(CorpusQueryPart {
                token: QueryToken::Composed(ComposedQuery {
                    composition: composer_found.unwrap().to_string(),
                    atoms: chunks.iter().map(|c| parse_query_atom(c.trim())).collect(),
                }),
            });
            continue;
        }
        if chunks.len() != 1 {
            panic!(
                "Unexpected number of chunks without composition in segment: {}",
                chunks.join(", ")
            );
        }
        parts.push(CorpusQueryPart {
            token: QueryToken::Atom(parse_query_atom(chunks[0].trim())),
        });
    }
    assert!(current.trim().is_empty());
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
            assert_eq!(wq, "arma");
        } else {
            panic!("Expected WordQuery");
        }
        if let QueryToken::Atom(CorpusQueryAtom::Lemma(lq)) = &query.parts[1].token {
            assert_eq!(lq, "virumque");
        } else {
            panic!("Expected LemmaQuery");
        }
    }

    #[test]
    fn test_parse_composed_query_with_and() {
        let query_str = "[case:1 and gender:1]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 1);
        if let QueryToken::Composed(cq) = &query.parts[0].token {
            assert_eq!(cq.composition, "and");
            assert_eq!(cq.atoms.len(), 2);
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[0] {
                assert_eq!(category, "case");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[1] {
                assert_eq!(category, "gender");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
        } else {
            panic!("Expected ComposedQuery");
        }
    }

    #[test]
    fn test_parse_composed_query_with_or() {
        let query_str = "[case:1 or gender:1]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 1);
        if let QueryToken::Composed(cq) = &query.parts[0].token {
            assert_eq!(cq.composition, "or");
            assert_eq!(cq.atoms.len(), 2);
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[0] {
                assert_eq!(category, "case");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[1] {
                assert_eq!(category, "gender");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
        } else {
            panic!("Expected ComposedQuery");
        }
    }

    #[test]
    #[should_panic(expected = "Multiple compositions found in segment")]
    fn test_parse_composed_query_with_mixed_combiners() {
        let query_str = "[case:1 or gender:1 and number:1]";
        parse_query(query_str);
    }

    #[test]
    fn test_parse_composed_query_with_many_or() {
        let query_str = "[case:1 or gender:1 or number:1]";
        let query = parse_query(query_str);
        assert_eq!(query.parts.len(), 1);
        if let QueryToken::Composed(cq) = &query.parts[0].token {
            assert_eq!(cq.composition, "or");
            assert_eq!(cq.atoms.len(), 3);
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[0] {
                assert_eq!(category, "case");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[1] {
                assert_eq!(category, "gender");
                assert_eq!(value, "1");
            } else {
                panic!("Expected InflectionQuery");
            }
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[2] {
                assert_eq!(category, "number");
                assert_eq!(value, "1");
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
            assert_eq!(wq, "test");
        } else {
            panic!("Expected WordQuery");
        }

        if let QueryToken::Composed(cq) = &query.parts[1].token {
            assert_eq!(cq.composition, "and");
            assert_eq!(cq.atoms.len(), 2);
            if let CorpusQueryAtom::Lemma(lq) = &cq.atoms[0] {
                assert_eq!(lq, "foo");
            } else {
                panic!("Expected LemmaQuery");
            }
            if let CorpusQueryAtom::Inflection { category, value } = &cq.atoms[1] {
                assert_eq!(category, "case");
                assert_eq!(value, "2");
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
            assert_eq!(wq, "spaced");
        } else {
            panic!("Expected WordQuery");
        }
    }
}
