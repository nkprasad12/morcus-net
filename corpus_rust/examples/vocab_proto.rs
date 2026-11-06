//! PROTOTYPE (TODOS.md §3.4): measures `SortedVocab` against today's
//! `id_table["word"]` on a real corpus build.
//!
//! Not production code: written quickly to produce the numbers in §3.4.
//! Review it properly or delete it once that work concludes.
//!
//! cargo run --release -p corpus --example vocab_proto -- build/corpus/latin_corpus.json
//! cargo run --release -p corpus --example vocab_proto -- --startup <corpus.json>

use corpus::corpus_index::{StoredMapValue, deserialize_corpus};
use corpus::sorted_vocab::SortedVocab;
use memmap2::MmapOptions;
use std::alloc::{GlobalAlloc, Layout, System};
use std::collections::HashMap;
use std::fs::File;
use std::hint::black_box;
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};
use std::time::Instant;

/// Counts live heap bytes as malloc actually reserves them: the usable size
/// of each block plus glibc's 8-byte chunk header.
struct Counting;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static REQUESTED: AtomicUsize = AtomicUsize::new(0);

fn reserved(p: *mut u8) -> usize {
    unsafe { libc::malloc_usable_size(p.cast()) + 8 }
}

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let p = unsafe { System.alloc(layout) };
        if !p.is_null() {
            LIVE.fetch_add(reserved(p), Relaxed);
            REQUESTED.fetch_add(layout.size(), Relaxed);
        }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, layout: Layout) {
        LIVE.fetch_sub(reserved(p), Relaxed);
        REQUESTED.fetch_sub(layout.size(), Relaxed);
        unsafe { System.dealloc(p, layout) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

fn heap() -> (usize, usize) {
    (LIVE.load(Relaxed), REQUESTED.load(Relaxed))
}

fn rss_mb() -> f64 {
    let statm = std::fs::read_to_string("/proc/self/statm").unwrap_or_default();
    let pages: f64 = statm
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);
    pages * 4096.0 / 1e6
}

fn mb(bytes: usize) -> f64 {
    bytes as f64 / 1e6
}

/// Best-of-`runs` milliseconds.
fn best_ms(runs: usize, mut f: impl FnMut()) -> f64 {
    let mut best = f64::MAX;
    for _ in 0..runs {
        let t = Instant::now();
        f();
        best = best.min(t.elapsed().as_secs_f64() * 1e3);
    }
    best
}

fn startup(path: &str) {
    let (h0, _) = heap();
    let rss0 = rss_mb();
    let t = Instant::now();
    let corpus = deserialize_corpus(path).expect("corpus");
    let ms = t.elapsed().as_secs_f64() * 1e3;
    let (h1, _) = heap();
    println!(
        "startup {path}: parse {ms:.0} ms, live heap {:.1} MB, RSS +{:.1} MB, words {}",
        mb(h1 - h0),
        rss_mb() - rss0,
        corpus.id_table.get("word").map_or(0, |m| m.len())
    );
}

fn lcg_shuffle<T>(items: &mut [T]) {
    let mut s: u64 = 0x9e3779b97f4a7c15;
    for i in (1..items.len()).rev() {
        s = s
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        items.swap(i, (s >> 33) as usize % (i + 1));
    }
}

/// ORs every listed token into a fresh bitmask over the corpus; returns hits.
fn merge_lists<'a>(lists: impl Iterator<Item = &'a [u32]>, num_tokens: usize) -> usize {
    let mut mask = vec![0u64; num_tokens.div_ceil(64)];
    let mut hits = 0;
    for list in lists {
        hits += list.len();
        for &tok in list {
            mask[tok as usize >> 6] |= 1 << (tok & 63);
        }
    }
    black_box(&mask);
    hits
}

/// Median, p90 and p99 of `samples`, in microseconds.
fn percentiles(mut samples: Vec<f64>) -> (f64, f64, f64) {
    samples.sort_by(f64::total_cmp);
    let at = |q: f64| samples[((samples.len() - 1) as f64 * q).round() as usize];
    (at(0.5), at(0.9), at(0.99))
}

/// Pushes this core's L1/L2/L3 out by reading a buffer several times larger
/// than its L3 (16 MB per CCX on this EPYC; pin the process to one core), so
/// the next operation starts with cold caches and TLB, like a one-off query
/// arriving between unrelated Node work.
struct Evictor(Vec<u64>);

impl Evictor {
    fn new() -> Self {
        Evictor((0..(64usize << 20) / 8).map(|i| i as u64).collect())
    }
    fn evict(&self) {
        black_box(
            self.0
                .iter()
                .step_by(8)
                .fold(0u64, |s, x| s.wrapping_add(*x)),
        );
    }
}

/// One timed run of `f`, in microseconds, with cold caches unless `warm`.
fn one_shot<T>(ev: &Evictor, cold: bool, prepare: impl FnOnce(), f: impl FnOnce() -> T) -> f64 {
    if cold {
        ev.evict();
    }
    // Whatever a real query would already have in hand (its own text, the
    // IDs the lookup step just produced) is touched after evicting.
    prepare();
    let t = Instant::now();
    black_box(f());
    t.elapsed().as_secs_f64() * 1e6
}

#[allow(clippy::too_many_arguments)]
fn cold_bench<'a>(
    word_map: &HashMap<String, u32>,
    old_words: &[&str],
    word_index: &[StoredMapValue],
    vocab: &SortedVocab,
    new_to_old: &[u32],
    scattered_at: &dyn Fn(u32) -> &'a [u32],
    contiguous_at: &dyn Fn(u32) -> &'a [u32],
    num_tokens: usize,
) {
    let ev = Evictor::new();
    let mut rng = 0x2545f4914f6cdd1du64;
    let mut next = move || {
        rng = rng
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        rng >> 33
    };

    // --- Exact lookup, one word at a time. ---
    // Queries are uniform over the vocabulary, or weighted by how often each
    // word occurs (closer to what people search for).
    let cumulative: Vec<u64> = word_index
        .iter()
        .scan(0u64, |acc, m| {
            if let StoredMapValue::Packed { len, .. } = m {
                *acc += *len as u64;
            }
            Some(*acc)
        })
        .collect();
    let total = *cumulative.last().expect("words");
    const LOOKUPS: usize = 2000;
    println!("exact lookup, one-shot, {LOOKUPS} words each (µs: median / p90 / p99)");
    for (label, weighted) in [("uniform", false), ("by frequency", true)] {
        let queries: Vec<String> = (0..LOOKUPS)
            .map(|_| {
                let old = if weighted {
                    let r = next() * next() % total;
                    cumulative.partition_point(|&c| c <= r)
                } else {
                    next() as usize % old_words.len()
                };
                old_words[old].to_string()
            })
            .collect();
        for cold in [false, true] {
            let mut hash = Vec::new();
            let mut sorted = Vec::new();
            for q in &queries {
                let touch = || {
                    black_box(q.as_bytes().iter().map(|&b| b as u32).sum::<u32>());
                };
                hash.push(one_shot(&ev, cold, touch, || {
                    word_map.get(q.as_str()).copied()
                }));
                sorted.push(one_shot(&ev, cold, touch, || vocab.lookup(q)));
            }
            let (h, s) = (percentiles(hash), percentiles(sorted));
            println!(
                "  {label:<13} {:<5} HashMap {:>5.2} / {:>5.2} / {:>5.2}   binary search {:>5.2} / {:>5.2} / {:>5.2}",
                if cold { "cold" } else { "warm" },
                h.0,
                h.1,
                h.2,
                s.0,
                s.1,
                s.2
            );
        }
    }

    // --- Wildcards: option A (scan + scattered merge) vs B (sorted + contiguous). ---
    const RUNS: usize = 40;
    println!("\nwildcards, cold, {RUNS} one-shot runs each (ms, median / p90)");
    println!(
        "pattern     words    hits | find: HashMap scan     sorted | merge: scattered    contiguous | total: A           B"
    );
    for pat in ["bell*", "am*", "con*", "in*", "*tio", "*que", "in*bilis"] {
        let (pre, suf) = pat.split_once('*').expect("wildcard");
        let ids = || -> Vec<u32> {
            if pre.is_empty() {
                vocab.suffix_ids(suf).to_vec()
            } else {
                vocab
                    .prefix_range(pre)
                    .filter(|&id| {
                        let w = vocab.word(id);
                        w.len() >= pre.len() + suf.len() && w.ends_with(suf.as_bytes())
                    })
                    .collect()
            }
        };
        let scan = || -> Vec<u32> {
            word_map
                .iter()
                .filter(|(w, _)| {
                    w.len() >= pre.len() + suf.len() && w.starts_with(pre) && w.ends_with(suf)
                })
                .map(|(_, &id)| id)
                .collect()
        };
        let matched_new = ids();
        let matched_old: Vec<u32> = matched_new
            .iter()
            .map(|&id| new_to_old[id as usize])
            .collect();
        let hits: usize = matched_new.iter().map(|&id| contiguous_at(id).len()).sum();
        let touch_new = || {
            black_box(matched_new.iter().sum::<u32>());
        };
        let touch_old = || {
            black_box(matched_old.iter().sum::<u32>());
        };
        let mut s = [
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
        ];
        for _ in 0..RUNS {
            let scan_us = one_shot(&ev, true, || {}, scan);
            let find_us = one_shot(&ev, true, || {}, ids);
            let scattered_us = one_shot(&ev, true, touch_old, || {
                merge_lists(matched_old.iter().map(|&id| scattered_at(id)), num_tokens)
            });
            let contiguous_us = one_shot(&ev, true, touch_new, || {
                merge_lists(matched_new.iter().map(|&id| contiguous_at(id)), num_tokens)
            });
            for (v, x) in s.iter_mut().zip([
                scan_us,
                find_us,
                scattered_us,
                contiguous_us,
                scan_us + scattered_us,
                find_us + contiguous_us,
            ]) {
                v.push(x / 1e3);
            }
        }
        let [a, b, c, d, e, f] = s.map(percentiles);
        println!(
            "{pat:<9} {:>7} {hits:>7} | {:>6.2} / {:<6.2} {:>5.3} / {:<5.3} | {:>6.2} / {:<6.2} {:>5.2} / {:<5.2} | {:>5.2} / {:<5.2} {:>5.2} / {:<5.2}",
            matched_new.len(),
            a.0,
            a.1,
            b.0,
            b.1,
            c.0,
            c.1,
            d.0,
            d.1,
            e.0,
            e.1,
            f.0,
            f.1
        );
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--startup") {
        startup(&args[2]);
        return;
    }
    let path = args
        .iter()
        .skip(1)
        .find(|a| !a.starts_with("--"))
        .map_or("build/corpus/latin_corpus.json", String::as_str);
    let mut corpus = deserialize_corpus(path).expect("corpus");
    let num_tokens = corpus.num_tokens as usize;

    // --- Memory: today's word map vs the packed vocabulary. ---
    let word_map: HashMap<String, u32> = corpus.id_table.remove("word").expect("word table");
    let mut old_words: Vec<&str> = vec![""; word_map.len()];
    for (w, &id) in &word_map {
        old_words[id as usize] = w.as_str();
    }
    let (h0, r0) = heap();
    let t = Instant::now();
    let (vocab, new_to_old) = SortedVocab::build(&old_words);
    let build_ms = t.elapsed().as_secs_f64() * 1e3;
    let (h1, r1) = heap();
    // `new_to_old` is prototype-only: a real build writes indices in new-ID
    // order, so it isn't kept. Leave it out of the vocabulary's footprint.
    let mapping = 4 * new_to_old.capacity();
    let text: usize = old_words.iter().map(|w| w.len()).sum();
    println!(
        "vocabulary: {} words, {:.2} MB of text, {num_tokens} tokens",
        vocab.len(),
        mb(text)
    );
    println!(
        "SortedVocab: {:.2} MB held (text {:.2} + offsets {:.2} + by_suffix {:.2}); malloc-reserved {:.2} MB; built in {build_ms:.0} ms",
        mb(vocab.heap_bytes()),
        mb(text),
        mb(4 * (vocab.len() + 1)),
        mb(4 * vocab.len()),
        mb(h1 - h0 - mapping),
    );
    let _ = r1 - r0;

    // --- Exact lookup. ---
    let mut queries: Vec<&str> = old_words.clone();
    lcg_shuffle(&mut queries);
    let n = queries.len() as f64;
    let mut found = 0;
    let hash_ms = best_ms(10, || {
        found = queries
            .iter()
            .filter(|w| word_map.contains_key(**w))
            .count();
    });
    let mut found2 = 0;
    let bin_ms = best_ms(10, || {
        found2 = queries.iter().filter(|w| vocab.lookup(w).is_some()).count();
    });
    assert_eq!(found, found2);
    for (new, &old) in new_to_old.iter().enumerate().step_by(997) {
        assert_eq!(vocab.lookup(old_words[old as usize]), Some(new as u32));
    }
    let (mut total, mut max) = (0u64, 0u32);
    for w in &queries {
        let (_, c) = vocab.lookup_counting(w);
        total += c as u64;
        max = max.max(c);
    }
    let misses = ["xqzv", "amorr", "bellumx", "a", "zzzzzz"];
    assert!(
        misses
            .iter()
            .all(|w| word_map.contains_key(*w) == vocab.lookup(w).is_some())
    );
    println!(
        "exact lookup (all {} words, shuffled): HashMap {:.0} ns, binary search {:.0} ns; comparisons avg {:.1}, max {max}",
        queries.len(),
        hash_ms * 1e6 / n,
        bin_ms * 1e6 / n,
        total as f64 / n
    );

    // --- Wildcards: lookup, then merge (scattered lists vs contiguous lists). ---
    let file = File::open(&corpus.raw_buffer_path).expect("buffers");
    let mmap = unsafe { MmapOptions::new().populate().map(&file) }.expect("mmap");
    // Set VOCAB_PROTO_HEAP=1 to read the buffers into the heap instead, which
    // separates the effect of the layout from mmap vs anonymous memory.
    let heap_copy: Option<Vec<u32>> = std::env::var("VOCAB_PROTO_HEAP").ok().map(|_| {
        mmap.as_chunks::<4>()
            .0
            .iter()
            .map(|b| u32::from_le_bytes(*b))
            .collect()
    });
    let word_index = corpus.indices.get("word").expect("word index");
    let list_at = |old: u32| -> &[u32] {
        match word_index[old as usize] {
            StoredMapValue::Packed { offset, len } => {
                if let Some(words) = &heap_copy {
                    let start = offset as usize / 4;
                    return &words[start..start + len as usize];
                }
                let bytes = &mmap[offset as usize..offset as usize + 4 * len as usize];
                // The writer 4-byte aligns lists (it writes u32 arrays back to back).
                unsafe { std::slice::from_raw_parts(bytes.as_ptr().cast(), len as usize) }
            }
            StoredMapValue::BitMask { .. } => panic!("no word bitmasks in this build"),
        }
    };
    // What a renumbered build would write: lists in new-ID order, back to back.
    let mut contiguous: Vec<u32> = Vec::new();
    let mut starts: Vec<usize> = vec![0];
    for &old in &new_to_old {
        contiguous.extend_from_slice(list_at(old));
        starts.push(contiguous.len());
    }
    let new_list = |id: u32| &contiguous[starts[id as usize]..starts[id as usize + 1]];

    if args.iter().any(|a| a == "--cold") {
        // The renumbered layout as a populated mmap, as the engine would load it.
        let cpath = "target/vocab_proto_contiguous.bin";
        let bytes: Vec<u8> = contiguous.iter().flat_map(|v| v.to_le_bytes()).collect();
        std::fs::write(cpath, &bytes).expect("write contiguous lists");
        drop(bytes);
        let cfile = File::open(cpath).expect("open contiguous lists");
        let cmap = unsafe { MmapOptions::new().populate().map(&cfile) }.expect("mmap");
        // Index metadata in new-ID order, as a renumbered build would write it.
        let new_meta: Vec<StoredMapValue> = (0..vocab.len())
            .map(|i| StoredMapValue::Packed {
                offset: (4 * starts[i]) as u32,
                len: (starts[i + 1] - starts[i]) as u32,
            })
            .collect();
        let cont_at = |id: u32| -> &[u32] {
            match new_meta[id as usize] {
                StoredMapValue::Packed { offset, len } => {
                    let b = &cmap[offset as usize..offset as usize + 4 * len as usize];
                    unsafe { std::slice::from_raw_parts(b.as_ptr().cast(), len as usize) }
                }
                StoredMapValue::BitMask { .. } => unreachable!(),
            }
        };
        cold_bench(
            &word_map,
            &old_words,
            word_index,
            &vocab,
            &new_to_old,
            &list_at,
            &cont_at,
            num_tokens,
        );
        return;
    }

    println!(
        "\npattern     words    hits | lookup: HashMap scan  sorted | count hits | merge: scattered  contiguous"
    );
    for pat in ["bell*", "am*", "con*", "in*", "*tio", "*que", "in*bilis"] {
        let (pre, suf) = pat.split_once('*').expect("wildcard");
        let scan_ms = best_ms(20, || {
            black_box(
                word_map
                    .keys()
                    .filter(|w| {
                        w.len() >= pre.len() + suf.len() && w.starts_with(pre) && w.ends_with(suf)
                    })
                    .count(),
            );
        });
        let ids = |v: &SortedVocab| -> Vec<u32> {
            if pre.is_empty() {
                v.suffix_ids(suf).to_vec()
            } else {
                v.prefix_range(pre)
                    .filter(|&id| {
                        v.word(id).len() >= pre.len() + suf.len()
                            && v.word(id).ends_with(suf.as_bytes())
                    })
                    .collect()
            }
        };
        let sorted_ms = best_ms(200, || {
            black_box(ids(&vocab));
        });
        let matched = ids(&vocab);
        let expected = word_map
            .keys()
            .filter(|w| w.len() >= pre.len() + suf.len() && w.starts_with(pre) && w.ends_with(suf))
            .count();
        assert_eq!(matched.len(), expected, "{pat}");
        let count_ms = best_ms(200, || {
            black_box(
                matched
                    .iter()
                    .map(|&id| starts[id as usize + 1] - starts[id as usize])
                    .sum::<usize>(),
            );
        });
        let mut hits = 0;
        let scattered_ms = best_ms(20, || {
            hits = merge_lists(
                matched.iter().map(|&id| list_at(new_to_old[id as usize])),
                num_tokens,
            );
        });
        let contiguous_ms = best_ms(20, || {
            assert_eq!(
                merge_lists(matched.iter().map(|&id| new_list(id)), num_tokens),
                hits
            );
        });
        println!(
            "{pat:<9} {:>7} {hits:>7} | {scan_ms:>17.3} {sorted_ms:>7.4} | {count_ms:>10.4} | {scattered_ms:>16.3} {contiguous_ms:>11.3}",
            matched.len()
        );
    }

    // --- Today's map, measured last by dropping it. ---
    drop(queries);
    drop(old_words);
    let (h2, r2) = heap();
    drop(word_map);
    let (h3, r3) = heap();
    println!(
        "\nid_table[\"word\"] HashMap<String, u32>: malloc-reserved {:.2} MB (requested {:.2} MB)",
        mb(h2 - h3),
        mb(r2 - r3)
    );
}
