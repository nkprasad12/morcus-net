mod bitmask_utils;
mod common;
mod corpus_query_engine;
mod corpus_serialization;
mod packed_arrays;
mod packed_index_utils;

const CORPUS_ROOT: &str = "../../build/corpus/latin_corpus.json";

fn main() {
    let corpus = corpus_serialization::deserialize_corpus(CORPUS_ROOT)
        .expect("Failed to deserialize corpus");
    let engine =
        corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine");
    let query: corpus_query_engine::CorpusQuery = corpus_query_engine::CorpusQuery {
        parts: vec![
            corpus_query_engine::CorpusQueryPart {
                token: corpus_query_engine::QueryToken::Atom(
                    corpus_query_engine::CorpusQueryAtom::Lemma(corpus_query_engine::LemmaQuery {
                        lemma: "do".to_string(),
                    }),
                ),
            },
            corpus_query_engine::CorpusQueryPart {
                token: corpus_query_engine::QueryToken::Atom(
                    corpus_query_engine::CorpusQueryAtom::Word(corpus_query_engine::WordQuery {
                        word: "oscula".to_string(),
                    }),
                ),
            },
            corpus_query_engine::CorpusQueryPart {
                token: corpus_query_engine::QueryToken::Composed(
                    corpus_query_engine::ComposedQuery {
                        composition: "and".to_string(),
                        atoms: vec![
                            corpus_query_engine::CorpusQueryAtom::Inflection(
                                corpus_query_engine::InflectionQuery {
                                    category: "case".to_string(),
                                    value: "3".to_string(),
                                },
                            ),
                            corpus_query_engine::CorpusQueryAtom::Lemma(
                                corpus_query_engine::LemmaQuery {
                                    lemma: "natus".to_string(),
                                },
                            ),
                        ],
                    },
                ),
            },
        ],
    };
    let results = engine
        .query_corpus(&query, 0, Some(10))
        .expect("Query failed");
    println!(
        "Showing results {}-{} of {} matches:\n",
        results.page_start + 1,
        results.page_start + results.matches.len(),
        results.total_results
    );
    for m in results.matches {
        println!("  {} - {} {}", m.author, m.work_name, m.section);
        println!("    {}*{}*{}", m.left_context, m.text, m.right_context,);
        println!();
    }
}
