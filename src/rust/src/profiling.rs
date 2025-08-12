mod bitmask_in_place_utils;
mod packed_index_utils;

use std::time::{Instant};
use packed_index_utils::smear_bitmask;
use packed_index_utils::to_bitmask;

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
    assert!(count <= upper_bound, "Count cannot be greater than upperBound.");
    let mut rand = Mulberry32::new(seed.unwrap_or_else(|| {
        use std::time::SystemTime;
        SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as u32
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
    sizes.iter().enumerate()
        .map(|(i, &sz)| create_data_array(sz, upper_bound, Some(seed + i as u32)))
        .collect()
}

fn percentile(arr: &[f64], p: f64) -> f64 {
    if arr.is_empty() { return f64::NAN; }
    let mut sorted = arr.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pos = p / 100.0 * (sorted.len() as f64 - 1.0);
    let lower = pos.floor() as usize;
    let upper = pos.ceil() as usize;
    let weight = pos - lower as f64;
    sorted[lower] * (1.0 - weight) + sorted[upper] * weight
}

fn print_data_summary(times: &[f64]) {
    let mean: f64 = times.iter().sum::<f64>() / times.len() as f64;
    let percentile_keys = [5.0, 10.0, 25.0, 50.0, 75.0, 90.0, 95.0];
    println!("Mean: {:.2} ms per iteration [{} iterations]", mean, times.len());
    println!("Percentiles:");
    for &p in &percentile_keys {
        println!("- p{:2}: {:.2} ms", p as u32, percentile(times, p));
    }
    let mut sorted_times: Vec<(f64, usize)> = times.iter().copied().enumerate().map(|(i, t)| (t, i)).collect();
    sorted_times.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    let tail = 5;
    let tail_size = ((times.len() as f64 * (tail as f64 / 100.0)).ceil()) as usize;
    let min_tail = &sorted_times[..tail_size];
    let max_tail = &sorted_times[sorted_times.len()-tail_size..];
    println!("Min {}%: {} (indices: {})",
        tail,
        min_tail.iter().map(|x| format!("{:.2}", x.0)).collect::<Vec<_>>().join(", "),
        min_tail.iter().map(|x| x.1.to_string()).collect::<Vec<_>>().join(", ")
    );
    println!("Max {}%: {} (indices: {})",
        tail,
        max_tail.iter().map(|x| format!("{:.2}", x.0)).collect::<Vec<_>>().join(", "),
        max_tail.iter().map(|x| x.1.to_string()).collect::<Vec<_>>().join(", ")
    );
}

fn run_profiling() {
    let fraction: u32 = 1024;
    let size = POW_2_24 / fraction;
    let sizes = vec![size; 4];
    let data = create_random_data_arrays(POW_2_24, &sizes, 42);

    let mut last_len = 0usize;
    let mut times = Vec::new();
    let reps = 100;

    for i in 0..reps {
        let k = (i % 2) * 2;
        let a = &data[k];
        // let b = &data[k + 1];

        let start = Instant::now();
        // Add the operation to be measured below
        smear_bitmask(&a.bitmask, 15, "both");
        // Add the operation to be measured above
        let elapsed = start.elapsed();
        last_len = a.bitmask.len();
        times.push(elapsed.as_secs_f64() * 1000.0);
    }

    print_data_summary(&times);
    println!(
        "{} bits ({} set), {} words",
        POW_2_24,
        POW_2_24 / fraction,
        last_len
    );
}

fn main() {
    run_profiling();
}

/*
To run:
  cargo run --bin profiling
*/
