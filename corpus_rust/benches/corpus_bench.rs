use corpus::{corpus_query_engine, corpus_serialization, packed_index_utils::smear_bitmask};
use criterion::{Criterion, criterion_group, criterion_main};

const POW_2_24: u32 = 1 << 24;

struct Mulberry32 {
    t: u32,
}
impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Mulberry32 { t: seed }
    }
    fn next(&mut self) -> f64 {
        self.t = self.t.wrapping_add(0x6d2b79f5);
        let mut r = (self.t ^ (self.t >> 15)).wrapping_mul(1 | self.t);
        r ^= r.wrapping_add((r ^ (r >> 7)).wrapping_mul(61 | r));
        ((r ^ (r >> 14)) as u64 as f64) / 4294967296.0
    }
}

/// Generates an array of unique random non-negative integers in increasing order.
fn unique_random_sorted_ints(count: u32, upper_bound: u32, seed: Option<u32>) -> Vec<u32> {
    assert!(
        count <= upper_bound,
        "Count cannot be greater than upperBound."
    );
    let mut rand = Mulberry32::new(seed.unwrap_or_else(|| {
        use std::time::SystemTime;
        SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as u32
    }));
    let mut arr: Vec<u32> = (0..upper_bound).collect();
    // Fisher-Yates shuffle up to count
    for i in 0..count {
        let j = i + ((rand.next() * ((upper_bound - i) as f64)) as u32);
        arr.swap(i as usize, j as usize);
    }
    let mut result = arr[..count as usize].to_vec();
    result.sort_unstable();
    result
}

pub fn to_bitmask(indices: &[u32], upper_bound: u32) -> Vec<u64> {
    let mut bitmask = vec![0u64; upper_bound.div_ceil(64).try_into().unwrap()];
    for &idx in indices {
        let word = idx / 64;
        let bit = idx % 64;
        bitmask[word as usize] |= 1 << (63 - bit);
    }
    bitmask
}

struct DataArray {
    #[allow(dead_code)]
    bitmask8: Vec<u8>,
    bitmask: Vec<u64>,
    #[allow(dead_code)]
    indices: Vec<u32>,
    #[allow(dead_code)]
    upper_bound: u32,
    #[allow(dead_code)]
    num_elements: u32,
}

fn create_data_array(count: u32, upper_bound: u32, seed: Option<u32>) -> DataArray {
    let indices = unique_random_sorted_ints(count, upper_bound, seed);
    let bitmask = to_bitmask(&indices, upper_bound);
    let bitmask8 = bitmask.iter().flat_map(|w| w.to_le_bytes()).collect();
    DataArray {
        bitmask8,
        bitmask,
        indices,
        upper_bound,
        num_elements: count,
    }
}

fn create_random_data_arrays(upper_bound: u32, sizes: &[u32], seed: u32) -> Vec<DataArray> {
    sizes
        .iter()
        .enumerate()
        .map(|(i, &sz)| create_data_array(sz, upper_bound, Some(seed + i as u32)))
        .collect()
}

fn create_query_engine() -> corpus_query_engine::CorpusQueryEngine {
    const CORPUS_ROOT: &str = "build/corpus/latin_corpus.json";
    let corpus =
        corpus_serialization::deserialize_corpus(CORPUS_ROOT).expect("Failed to load corpus");
    corpus_query_engine::CorpusQueryEngine::new(corpus).expect("Failed to create query engine")
}

pub fn criterion_benchmark(c: &mut Criterion) {
    {
        std::env::set_current_dir("..").unwrap();
        let mut query_benches = c.benchmark_group("Query Execution");
        let corpus = create_query_engine();
        let dedit_oscula_nato = "@lemma:do oscula @case:dat";
        let bitmask_query = "@case:nom @case:dat @case:acc";
        let page_size = Some(100);
        query_benches.bench_function("dedit oscula nato", |b| {
            b.iter(|| {
                let _ = corpus.query_corpus(dedit_oscula_nato, 0, page_size, None);
            })
        });

        query_benches.bench_function("bitmask query", |b| {
            b.iter(|| {
                let _ = corpus.query_corpus(bitmask_query, 0, page_size, None);
            })
        });
    }
    {
        let mut smear_benches = c.benchmark_group("Smear Bitmask");
        let fraction: u32 = 1024;
        let size = POW_2_24 / fraction;
        let sizes = vec![size; 2];
        let data = create_random_data_arrays(POW_2_24, &sizes, 42);
        smear_benches.bench_function("smear 15 both", |b| {
            b.iter(|| smear_bitmask(&data[0].bitmask, 15, "both"))
        });
        smear_benches.bench_function("smear 7 both", |b| {
            b.iter(|| smear_bitmask(&data[0].bitmask, 7, "both"))
        });
        smear_benches.finish();
    }
}

criterion_group! {
    name = benches;
    config = Criterion::default()
        .warm_up_time(std::time::Duration::from_millis(250))
        .measurement_time(std::time::Duration::from_secs(2));
    targets = criterion_benchmark,
}
criterion_main!(benches);
