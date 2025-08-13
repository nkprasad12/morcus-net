mod corpus_serialization;

const CORPUS_ROOT: &str = "../../build/corpus/latin_corpus.json";

fn main() {
    let corpus = corpus_serialization::deserialize_corpus(CORPUS_ROOT)
        .expect("Failed to deserialize corpus");
    println!("Corpus loaded with {} words", corpus.stats.total_words);
}
