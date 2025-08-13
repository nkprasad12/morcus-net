mod bitmask_utils;
mod common;
mod corpus_serialization;
mod packed_arrays;
mod packed_index_utils;

const CORPUS_ROOT: &str = "../../build/corpus/latin_corpus.json";

fn main() {
    let corpus = corpus_serialization::deserialize_corpus(CORPUS_ROOT)
        .expect("Failed to deserialize corpus");
    println!("Corpus loaded with {} indices", corpus.indices.keys().cloned().collect::<Vec<String>>().join(", "));
}
