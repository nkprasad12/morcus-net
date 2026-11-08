use super::binary_format::HEADER_BYTES;
use super::jump_table::{bucket, pattern_buckets};
use super::*;
use crate::byte_readers::{ReaderKind, aligned_copy};

/// Builds a vocabulary where word `i` (in `words` order) has `i + 1`
/// postings, returning it and the words in sorted order.
fn vocab_of(words: &[&str]) -> (SortedVocab, Vec<String>) {
    let counts: Vec<u32> = (1..=words.len() as u32).collect();
    let (vocab, _) = SortedVocab::build(words, &counts).unwrap();
    vocab.verify_invariants().unwrap();
    let mut sorted: Vec<String> = words.iter().map(|w| w.to_string()).collect();
    sorted.sort();
    (vocab, sorted)
}

fn vocab() -> SortedVocab {
    vocab_of(&[
        "bellum",
        "amor",
        "bello",
        "ratio",
        "amo",
        "bellumque",
        "oratio",
    ])
    .0
}

fn word_str(v: &SortedVocab, id: u32) -> String {
    String::from_utf8(v.word(id).unwrap().to_vec()).unwrap()
}

fn words(v: &SortedVocab, ids: impl IntoIterator<Item = u32>) -> Vec<String> {
    ids.into_iter().map(|id| word_str(v, id)).collect()
}

/// Brute-force `prefix*suffix` matches, in ascending ID order.
fn brute(v: &SortedVocab, prefix: &str, suffix: &str) -> Vec<u32> {
    (0..v.len() as u32)
        .filter(|&id| {
            let w = v.word(id).unwrap();
            w.len() >= prefix.len() + suffix.len()
                && w.starts_with(prefix.as_bytes())
                && w.ends_with(suffix.as_bytes())
        })
        .collect()
}

/// A diverse word list: coarse low/high first bytes, 1-char words, bucket
/// edges ('`' = 0x60, '{' = 0x7b, 0x7f), and multi-byte UTF-8.
const DIVERSE: &[&str] = &[
    "!",
    "!a",
    "!z",
    "0",
    "09",
    "-",
    "-que",
    "A",
    "Za",
    "`",
    "`a",
    "a",
    "a!",
    "a-",
    "a0",
    "a`",
    "aa",
    "aab",
    "ab",
    "aba",
    "abba",
    "abxba",
    "az",
    "a{",
    "a\u{7f}",
    "aā",
    "aλ",
    "b",
    "ba",
    "in",
    "inin",
    "inaain",
    "inbilis",
    "incredibilis",
    "z",
    "z-",
    "za",
    "zz",
    "zzz",
    "z{",
    "zā",
    "{",
    "{a",
    "\u{7f}",
    "ā",
    "āa",
    "ām",
    "λ",
    "λόγος",
    "‾xlv‾",
    "‾",
    "\u{10FFFF}",
    "que",
    "atque",
    "itaque",
    "quoque",
    "ēque",
    "-ā",
    "ā-",
];

#[test]
fn ids_are_sorted_positions() {
    let v = vocab();
    assert_eq!(
        words(&v, 0..v.len() as u32),
        [
            "amo",
            "amor",
            "bello",
            "bellum",
            "bellumque",
            "oratio",
            "ratio"
        ]
    );
    assert_eq!(v.lookup("bellum"), Some(3));
    assert_eq!(v.lookup("amo"), Some(0));
    assert_eq!(v.lookup("ratio"), Some(6));
    assert_eq!(v.lookup("bell"), None);
    assert_eq!(v.lookup("zzz"), None);
    assert_eq!(v.lookup(""), None);
    assert_eq!(v.word(7), None);
    assert_eq!(v.word(u32::MAX), None);
}

#[test]
fn build_returns_new_to_old_order() {
    let input = ["bellum", "amor", "bello"];
    let (v, order) = SortedVocab::build(&input, &[5, 2, 9]).unwrap();
    assert_eq!(order, [1, 2, 0]);
    for (new, &old) in order.iter().enumerate() {
        assert_eq!(v.lookup(input[old as usize]), Some(new as u32));
    }
    // Postings follow the new order: amor (2), bello (9), bellum (5).
    assert_eq!(v.word_postings_range(0), Some(0..2));
    assert_eq!(v.word_postings_range(1), Some(2..11));
    assert_eq!(v.word_postings_range(2), Some(11..16));
}

#[test]
fn build_rejects_duplicates_and_mismatched_counts() {
    assert!(SortedVocab::build(&["a", "a"], &[1, 1]).is_err());
    assert!(SortedVocab::build(&["a", "b"], &[1]).is_err());
    assert!(SortedVocab::build(&["a", "b"], &[u32::MAX, 1]).is_err());
}

#[test]
fn encode_validates_input() {
    assert!(SortedVocab::encode(&["b", "a"], &[0, 0, 0]).is_err());
    assert!(SortedVocab::encode(&["a", "a"], &[0, 0, 0]).is_err());
    assert!(SortedVocab::encode(&["a"], &[0]).is_err());
    assert!(SortedVocab::encode(&["a"], &[2, 1]).is_err());
    // Postings offsets need not start at 0.
    let v = SortedVocab::from_bytes(SortedVocab::encode(&["a"], &[7, 9]).unwrap()).unwrap();
    assert_eq!(v.word_postings_range(0), Some(7..9));
}

#[test]
fn round_trip_and_layout() {
    let sorted = ["amo", "amor", "bello"];
    let bytes = SortedVocab::encode(&sorted, &[0, 1, 3, 6]).unwrap();
    assert_eq!(&bytes[0..4], b"MVCB");
    assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 1);
    assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 3);
    let text_len = "amoamorbello".len();
    assert_eq!(
        bytes.len(),
        12 + 4 * (2 * (NUM_BUCKETS + 1) + 4 + 3 + 4) + text_len
    );
    assert!(bytes.ends_with(b"amoamorbello"));
    let v = SortedVocab::from_bytes(bytes.clone()).unwrap();
    assert_eq!(v.byte_len(), bytes.len());
    assert_eq!(words(&v, 0..3), sorted);
    assert_eq!(v.prefix_postings_range(0..3), Some(0..6));
}

#[test]
fn open_from_file_with_every_reader_kind() {
    let bytes = SortedVocab::encode(&["amo", "amor", "bello"], &[0, 1, 3, 6]).unwrap();
    let path = std::env::temp_dir().join(format!("sorted_vocab_test_{}.bin", std::process::id()));
    std::fs::write(&path, &bytes).unwrap();
    let path_str = path.to_str().unwrap();
    for kind in [
        ReaderKind::Mmap,
        ReaderKind::MmapPopulated,
        ReaderKind::InMemory,
    ] {
        let v = SortedVocab::open(path_str, kind).unwrap();
        assert_eq!(v.lookup("amor"), Some(1));
        assert_eq!(v.prefix_range("am"), 0..2);
        assert_eq!(v.word_postings_range(2), Some(3..6));
    }
    std::fs::remove_file(&path).unwrap();
    assert!(SortedVocab::open(path_str, ReaderKind::Mmap).is_err());
}

#[test]
fn empty_vocab() {
    let v = SortedVocab::from_bytes(SortedVocab::encode(&[], &[0]).unwrap()).unwrap();
    assert_eq!(v.len(), 0);
    assert!(v.is_empty());
    assert_eq!(v.lookup(""), None);
    assert_eq!(v.lookup("a"), None);
    assert_eq!(v.prefix_range(""), 0..0);
    assert_eq!(v.prefix_range("a"), 0..0);
    assert!(v.suffix_ids_unsorted("").is_empty());
    assert!(v.suffix_ids_sorted("a").is_empty());
    assert!(v.prefix_suffix_ids_sorted("a", "b").is_empty());
    assert_eq!(v.word(0), None);
    assert_eq!(v.word_postings_range(0), None);
    assert_eq!(v.prefix_postings_range(0..0), Some(0..0));
}

#[test]
fn single_word() {
    let (v, _) = vocab_of(&["amor"]);
    assert_eq!(v.len(), 1);
    assert_eq!(v.lookup("amor"), Some(0));
    assert_eq!(v.lookup("amo"), None);
    assert_eq!(v.lookup("amorr"), None);
    assert_eq!(v.prefix_range(""), 0..1);
    assert_eq!(v.prefix_range("a"), 0..1);
    assert_eq!(v.prefix_range("amor"), 0..1);
    assert_eq!(v.prefix_range("amorr"), 1..1);
    assert_eq!(v.prefix_range("b"), 1..1);
    assert_eq!(v.suffix_ids_unsorted("r"), [0]);
    assert_eq!(v.suffix_ids_unsorted("amor"), [0]);
    assert!(v.suffix_ids_unsorted("xamor").is_empty());
    assert_eq!(v.prefix_suffix_ids_sorted("am", "or"), [0]);
    assert!(v.prefix_suffix_ids_sorted("amo", "mor").is_empty());
    assert_eq!(v.word_postings_range(0), Some(0..1));
    assert_eq!(v.word_postings_range(1), None);
}

#[test]
fn empty_string_word() {
    let (v, _) = vocab_of(&["", "a", "b"]);
    assert_eq!(v.lookup(""), Some(0));
    assert_eq!(v.prefix_range(""), 0..3);
    assert_eq!(v.prefix_range("a"), 1..2);
    assert_eq!(v.suffix_ids_unsorted("").len(), 3);
    assert_eq!(v.suffix_ids_unsorted("b"), [2]);
}

#[test]
fn prefix_and_suffix() {
    let v = vocab();
    assert_eq!(
        words(&v, v.prefix_range("bell")),
        ["bello", "bellum", "bellumque"]
    );
    assert_eq!(words(&v, v.prefix_range("amo")), ["amo", "amor"]);
    assert_eq!(words(&v, v.prefix_range("a")), ["amo", "amor"]);
    assert_eq!(v.prefix_range(""), 0..7);
    assert!(v.prefix_range("x").is_empty());
    assert!(v.prefix_range("c").is_empty());
    assert_eq!(
        words(&v, v.suffix_ids_unsorted("ratio").iter().copied()),
        ["ratio", "oratio"]
    );
    assert_eq!(
        words(&v, v.suffix_ids_unsorted("oratio").iter().copied()),
        ["oratio"]
    );
    assert_eq!(
        words(&v, v.suffix_ids_unsorted("o").iter().copied()),
        ["ratio", "oratio", "bello", "amo"]
    );
    assert_eq!(
        words(&v, v.suffix_ids_sorted("o")),
        ["amo", "bello", "oratio", "ratio"]
    );
    assert_eq!(words(&v, v.suffix_ids_sorted("que")), ["bellumque"]);
    assert!(v.suffix_ids_unsorted("xyz").is_empty());
    assert_eq!(v.suffix_ids_unsorted("").len(), 7);
}

#[test]
fn diverse_exact_lookups() {
    let (v, sorted) = vocab_of(DIVERSE);
    for (i, w) in sorted.iter().enumerate() {
        assert_eq!(v.lookup(w), Some(i as u32), "{w:?}");
        assert_eq!(word_str(&v, i as u32), *w);
    }
    for miss in [
        "", "!b", "1", "a\u{1}", "ac", "b!", "inini", "zzzz", "|", "ā!", "λό", "‾x", "\u{80}",
        "aā!", "Z", "`b", "{b",
    ] {
        assert_eq!(v.lookup(miss), None, "{miss:?}");
    }
}

#[test]
fn diverse_affixes_match_brute_force() {
    let (v, sorted) = vocab_of(DIVERSE);
    let mut patterns: Vec<String> = vec![
        "".into(),
        "a".into(),
        "!".into(),
        "-".into(),
        "{".into(),
        "\u{7f}".into(),
        "ā".into(),
        "λ".into(),
        "‾".into(),
        "a-".into(),
        "a{".into(),
        "aλ".into(),
        "in".into(),
        "que".into(),
        "xyz".into(),
        "\u{10FFFF}".into(),
        "q".into(),
        "e".into(),
    ];
    // Every prefix and suffix of every word, too (by character).
    for w in &sorted {
        let chars: Vec<char> = w.chars().collect();
        for k in 0..=chars.len() {
            patterns.push(chars[..k].iter().collect());
            patterns.push(chars[k..].iter().collect());
        }
    }
    patterns.sort();
    patterns.dedup();
    for p in &patterns {
        let expected = brute(&v, p, "");
        let range = v.prefix_range(p);
        assert_eq!(range.clone().collect::<Vec<_>>(), expected, "prefix {p:?}");
        assert_eq!(v.suffix_ids_sorted(p), brute(&v, "", p), "suffix {p:?}");
        let unsorted = v.suffix_ids_unsorted(p);
        assert!(
            unsorted.windows(2).all(
                |w| cmp_reversed(v.word(w[0]).unwrap(), v.word(w[1]).unwrap()) == Ordering::Less
            ),
            "suffix order {p:?}"
        );
    }
    for p in &patterns {
        for s in &patterns {
            assert_eq!(
                v.prefix_suffix_ids_sorted(p, s),
                brute(&v, p, s),
                "{p:?}*{s:?}"
            );
        }
    }
}

#[test]
fn utf8_affixes() {
    let (v, _) = vocab_of(DIVERSE);
    assert_eq!(words(&v, v.prefix_range("ā")), ["ā", "ā-", "āa", "ām"]);
    assert_eq!(words(&v, v.prefix_range("λ")), ["λ", "λόγος"]);
    assert_eq!(words(&v, v.prefix_range("‾")), ["‾", "‾xlv‾"]);
    assert_eq!(words(&v, v.suffix_ids_sorted("‾")), ["‾", "‾xlv‾"]);
    assert_eq!(words(&v, v.suffix_ids_sorted("ā")), ["-ā", "aā", "zā", "ā"]);
    assert_eq!(
        words(&v, v.suffix_ids_sorted("que")),
        ["-que", "atque", "itaque", "que", "quoque", "ēque"]
    );
}

#[test]
fn low_ascii_and_one_char_words() {
    let (v, _) = vocab_of(DIVERSE);
    // '!' sorts before '0', even though "!a" > "!" and "0" has one byte.
    assert_eq!(words(&v, v.prefix_range("!")), ["!", "!a", "!z"]);
    assert_eq!(words(&v, v.prefix_range("0")), ["0", "09"]);
    assert_eq!(words(&v, v.prefix_range("a")).first().unwrap(), "a");
    assert_eq!(words(&v, v.prefix_range("a")).last().unwrap(), "aλ");
    assert_eq!(words(&v, v.prefix_range("a-")), ["a-"]);
    assert_eq!(
        words(&v, v.prefix_range("z")),
        ["z", "z-", "za", "zz", "zzz", "z{", "zā"]
    );
    assert_eq!(words(&v, v.suffix_ids_sorted("-")), ["-", "a-", "z-", "ā-"]);
    assert_eq!(words(&v, v.suffix_ids_sorted("!")), ["!", "a!"]);
}

#[test]
fn bucket_is_monotonic() {
    let mut keys: Vec<Vec<u8>> = DIVERSE.iter().map(|w| w.as_bytes().to_vec()).collect();
    // Every one- and two-byte key, plus some three-byte ones.
    for b0 in 0..=255u8 {
        keys.push(vec![b0]);
        for b1 in 0..=255u8 {
            keys.push(vec![b0, b1]);
        }
        keys.push(vec![b0, 0, 0]);
        keys.push(vec![b0, 255, 255]);
        keys.push(vec![b0, b'm', b'a']);
    }
    keys.push(vec![]);
    keys.sort();
    keys.dedup();
    let buckets: Vec<usize> = keys.iter().map(|k| bucket(forward_key(k))).collect();
    assert!(buckets.windows(2).all(|w| w[0] <= w[1]));
    assert_eq!(buckets.first(), Some(&0));
    assert_eq!(buckets.last(), Some(&(NUM_BUCKETS - 1)));
    // Every bucket is reachable.
    let mut used = buckets.clone();
    used.dedup();
    assert_eq!(used, (0..NUM_BUCKETS).collect::<Vec<_>>());
    // A key's bucket is within the buckets of each of its prefixes.
    for k in &keys {
        for n in 0..=k.len() {
            assert!(pattern_buckets(forward_key(&k[..n])).contains(&bucket(forward_key(k))));
        }
    }
}

#[test]
fn overlapping_prefix_and_suffix_are_rejected() {
    let (v, _) = vocab_of(&["aba", "abba", "abxba", "in", "inin", "inaain", "ab", "ba"]);
    assert_eq!(
        words(&v, v.prefix_suffix_ids_sorted("ab", "ba")),
        ["abba", "abxba"]
    );
    assert_eq!(
        words(&v, v.prefix_suffix_ids_sorted("in", "in")),
        ["inaain", "inin"]
    );
    assert!(v.prefix_suffix_ids_sorted("aba", "a").is_empty());
    assert_eq!(
        words(&v, v.prefix_suffix_ids_sorted("a", "a")),
        ["aba", "abba", "abxba"]
    );
}

#[test]
fn smaller_side_first_is_equivalent() {
    // Many `in*` words, few `*bilis` words, and vice versa.
    let mut owned: Vec<String> = (0..200).map(|i| format!("in{i:03}x")).collect();
    owned.extend((0..5).map(|i| format!("in{i}bilis")));
    owned.extend((0..20).map(|i| format!("q{i:03}bilis")));
    owned.push("inbilis".into());
    owned.push("bilis".into());
    let refs: Vec<&str> = owned.iter().map(String::as_str).collect();
    let (v, _) = vocab_of(&refs);
    // Prefix side smaller.
    assert!(v.prefix_range("in1").len() < v.suffix_ids_unsorted("x").len());
    assert_eq!(
        v.prefix_suffix_ids_sorted("in1", "x"),
        brute(&v, "in1", "x")
    );
    // Suffix side smaller.
    assert!(v.prefix_range("in").len() > v.suffix_ids_unsorted("bilis").len());
    for (p, s) in [
        ("in", "bilis"),
        ("q", "bilis"),
        ("in", "x"),
        ("", "bilis"),
        ("in", ""),
    ] {
        let ids = v.prefix_suffix_ids_sorted(p, s);
        assert_eq!(ids, brute(&v, p, s), "{p}*{s}");
        assert!(ids.windows(2).all(|w| w[0] < w[1]));
    }
    assert_eq!(v.prefix_suffix_ids_sorted("in", "bilis").len(), 6);
}

#[test]
fn postings_ranges() {
    let v = vocab();
    // Counts are 1..=7 in input order: bellum 1, amor 2, bello 3, ratio 4,
    // amo 5, bellumque 6, oratio 7. Sorted: amo, amor, bello, bellum,
    // bellumque, oratio, ratio.
    assert_eq!(v.word_postings_range(0), Some(0..5));
    assert_eq!(v.word_postings_range(1), Some(5..7));
    assert_eq!(v.word_postings_range(2), Some(7..10));
    assert_eq!(v.word_postings_range(6), Some(24..28));
    assert_eq!(v.word_postings_range(7), None);
    assert_eq!(v.word_postings_range(u32::MAX), None);
    let bell = v.prefix_range("bell");
    assert_eq!(v.prefix_postings_range(bell), Some(7..17));
    assert_eq!(v.prefix_postings_range(0..7), Some(0..28));
    assert_eq!(v.prefix_postings_range(3..3), Some(10..10));
    assert_eq!(v.prefix_postings_range(0..8), None);
    #[allow(clippy::reversed_empty_ranges)]
    let reversed = 3..2;
    assert_eq!(v.prefix_postings_range(reversed), None);
    assert_eq!(v.sum_postings_len(&[]), 0);
    assert_eq!(v.sum_postings_len(&[0, 2, 6, 99]), 5 + 3 + 4);
}

// --- Corrupt inputs. ---

fn valid_bytes() -> Vec<u8> {
    SortedVocab::encode(&["amo", "amor", "bello"], &[0, 1, 3, 6]).unwrap()
}

fn set_u32(bytes: &mut [u8], at: usize, value: u32) {
    bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
}

const FORWARD_JUMP: usize = HEADER_BYTES;
const SUFFIX_JUMP: usize = FORWARD_JUMP + 4 * (NUM_BUCKETS + 1);
const TEXT_OFFSETS: usize = SUFFIX_JUMP + 4 * (NUM_BUCKETS + 1);
// For the three-word `valid_bytes`.
const BY_SUFFIX: usize = TEXT_OFFSETS + 4 * 4;
const POSTINGS: usize = BY_SUFFIX + 4 * 3;

fn open_err(bytes: Vec<u8>) -> String {
    match SortedVocab::from_bytes(bytes) {
        Ok(_) => panic!("expected an error"),
        Err(e) => e,
    }
}

#[test]
fn rejects_bad_header() {
    assert!(open_err(vec![]).contains("truncated"));
    assert!(open_err(valid_bytes()[..11].to_vec()).contains("truncated"));
    let mut bytes = valid_bytes();
    bytes[0] = b'X';
    assert!(open_err(bytes).contains("magic"));
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, 4, 2);
    assert!(open_err(bytes).contains("version"));
}

#[test]
fn rejects_truncated_or_oversized() {
    let bytes = valid_bytes();
    for cut in [12, 100, TEXT_OFFSETS + 2, POSTINGS + 4, bytes.len() - 1] {
        assert!(
            SortedVocab::from_bytes(bytes[..cut].to_vec()).is_err(),
            "{cut}"
        );
    }
    let mut longer = valid_bytes();
    longer.push(0);
    assert!(open_err(longer).contains("bytes long"));
    // A huge word count must not overflow the size computation.
    for count in [u32::MAX, u32::MAX / 4, u32::MAX / 12] {
        let mut bytes = valid_bytes();
        set_u32(&mut bytes, 8, count);
        assert!(open_err(bytes).contains("truncated"), "{count}");
    }
    // Nor a huge text length.
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, TEXT_OFFSETS + 12, u32::MAX);
    assert!(SortedVocab::from_bytes(bytes).is_err());
}

#[test]
fn rejects_unaligned_reader() {
    /// Serves `bytes` from an address that is 1 mod 4.
    struct Misaligned {
        storage: Vec<u8>,
        start: usize,
    }
    impl RawByteReader for Misaligned {
        fn bytes(&self, i: usize, j: usize) -> &[u8] {
            &self.storage[self.start..][i..j]
        }
    }
    let bytes = valid_bytes();
    let mut storage = vec![0u8; bytes.len() + 4];
    let base = storage.as_ptr() as usize;
    let start = (0..4).find(|s| (base + s) % 4 == 1).unwrap();
    storage[start..start + bytes.len()].copy_from_slice(&bytes);
    let reader = Misaligned { storage, start };
    let err = SortedVocab::from_reader(Box::new(reader), bytes.len())
        .err()
        .unwrap();
    assert!(err.contains("aligned"), "{err}");
}

#[test]
fn rejects_bad_tables_on_open() {
    let corrupt = |at: usize, value: u32| {
        let mut bytes = valid_bytes();
        set_u32(&mut bytes, at, value);
        open_err(bytes)
    };
    // Text offsets: nonzero start, decreasing.
    assert!(corrupt(TEXT_OFFSETS, 1).contains("text offsets"));
    assert!(corrupt(TEXT_OFFSETS + 4, 9).contains("text offsets"));
    // Jump table shape.
    assert!(corrupt(FORWARD_JUMP, 1).contains("forward_jump"));
    assert!(corrupt(FORWARD_JUMP + 4 * NUM_BUCKETS, 2).contains("forward_jump"));
    assert!(corrupt(FORWARD_JUMP + 4 * 300, 0).contains("forward_jump"));
    assert!(corrupt(SUFFIX_JUMP + 4 * 600, 0).contains("suffix_jump"));
    assert!(corrupt(SUFFIX_JUMP + 4 * 2, 3).contains("suffix_jump"));
    // by_suffix ID out of range.
    assert!(corrupt(BY_SUFFIX, 3).contains("out-of-range"));
    // Postings offsets decreasing.
    assert!(corrupt(POSTINGS + 4, 5).contains("postings"));
}

#[test]
fn verify_invariants_rejects_bad_order() {
    let verify_err = |bytes: Vec<u8>| -> String {
        let v = SortedVocab::from_bytes(bytes).unwrap();
        v.verify_invariants().err().unwrap()
    };
    SortedVocab::from_bytes(valid_bytes())
        .unwrap()
        .verify_invariants()
        .unwrap();
    // Words out of order: "amo" -> "bmo" (> "amor").
    let mut bytes = valid_bytes();
    let text = bytes.len() - "amoamorbello".len();
    bytes[text] = b'b';
    assert!(verify_err(bytes).contains("strictly increasing"));
    // A well-shaped jump table that puts "amor" (bucket 16) in bucket 17.
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, FORWARD_JUMP + 4 * 17, 1);
    assert!(verify_err(bytes).contains("forward_jump"));
    // Same for the suffix table: "olleb" is bucket 421, "oma" 422.
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, SUFFIX_JUMP + 4 * 422, 0);
    assert!(verify_err(bytes).contains("suffix_jump"));
    // by_suffix (= [2, 0, 1]) out of order, and with a duplicate.
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, BY_SUFFIX, 0);
    set_u32(&mut bytes, BY_SUFFIX + 4, 2);
    assert!(verify_err(bytes).contains("reversed"));
    let mut bytes = valid_bytes();
    set_u32(&mut bytes, BY_SUFFIX + 4, 2);
    assert!(verify_err(bytes).contains("reversed"));
}

#[test]
fn lookups_on_unverified_garbage_stay_in_bounds() {
    // Shuffled text and a scrambled by_suffix pass the open-time checks;
    // lookups may be wrong but must not panic.
    let mut bytes = valid_bytes();
    let text = bytes.len() - "amoamorbello".len();
    bytes[text..].reverse();
    set_u32(&mut bytes, BY_SUFFIX, 1);
    set_u32(&mut bytes, BY_SUFFIX + 4, 1);
    set_u32(&mut bytes, BY_SUFFIX + 8, 1);
    let v = SortedVocab::from_bytes(bytes).unwrap();
    assert!(v.verify_invariants().is_err());
    for pattern in ["", "a", "am", "o", "ol", "zz", "ā"] {
        v.lookup(pattern);
        v.prefix_range(pattern);
        v.suffix_ids_sorted(pattern);
        v.prefix_suffix_ids_sorted(pattern, pattern);
    }
}

#[test]
fn unaligned_input_is_copied() {
    let bytes = valid_bytes();
    let len = bytes.len();
    let v = SortedVocab::from_reader(aligned_copy(&bytes), len).unwrap();
    v.verify_invariants().unwrap();
    assert_eq!(v.lookup("bello"), Some(2));
    // An odd-length buffer has a partial last `u32`.
    let mut odd = SortedVocab::encode(&["ab"], &[0, 0]).unwrap();
    assert_eq!(odd.len() % 4, 2);
    let len = odd.len();
    let v = SortedVocab::from_reader(aligned_copy(&odd), len).unwrap();
    assert_eq!(v.lookup("ab"), Some(0));
    odd.push(0);
    assert!(SortedVocab::from_reader(aligned_copy(&odd), len + 1).is_err());
}
