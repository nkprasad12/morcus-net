//! PROTOTYPE (TODOS.md §3.4): the word vocabulary as one sorted, packed array.
//!
//! Not used by the engine yet, and not reviewed as production code. Review it
//! properly (or replace it) when §3.4 is implemented, or delete it if that
//! work is dropped.
//!
//! If the corpus build numbered words in sorted order, a word's position here
//! would be its ID, replacing `id_table["word"]` (a `HashMap<String, u32>`).
//! Exact lookup is a binary search; `prefix*` is a contiguous ID range; and
//! `*suffix` is a contiguous run of `by_suffix`, the IDs sorted by reversed
//! spelling. Comparisons are on bytes, so a suffix match on UTF-8 bytes is
//! also a match on characters.

use std::cmp::Ordering;
use std::ops::Range;

pub struct SortedVocab {
    /// Every word, concatenated in sorted (byte-wise) order.
    bytes: Vec<u8>,
    /// `bytes[offsets[i]..offsets[i + 1]]` is word `i`. Length `len() + 1`.
    offsets: Vec<u32>,
    /// Word IDs sorted by their reversed bytes, for suffix lookups.
    by_suffix: Vec<u32>,
}

/// The first index in `0..n` for which `is_before` is false, assuming it is
/// true for a prefix of `0..n` and false after.
fn partition(n: usize, mut is_before: impl FnMut(usize) -> bool) -> usize {
    let (mut lo, mut hi) = (0, n);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if is_before(mid) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    lo
}

fn cmp_reversed(a: &[u8], b: &[u8]) -> Ordering {
    a.iter().rev().cmp(b.iter().rev())
}

impl SortedVocab {
    /// Builds the vocabulary. Also returns, for each new ID, the index of that
    /// word in `words` (which a real build would use to renumber its indices).
    pub fn build(words: &[&str]) -> (Self, Vec<u32>) {
        let mut order: Vec<u32> = (0..words.len() as u32).collect();
        order.sort_unstable_by(|&a, &b| words[a as usize].cmp(words[b as usize]));
        let total: usize = words.iter().map(|w| w.len()).sum();
        let mut bytes = Vec::with_capacity(total);
        let mut offsets = Vec::with_capacity(words.len() + 1);
        offsets.push(0);
        for &i in &order {
            bytes.extend_from_slice(words[i as usize].as_bytes());
            offsets.push(bytes.len() as u32);
        }
        let mut vocab = SortedVocab {
            bytes,
            offsets,
            by_suffix: Vec::new(),
        };
        let mut by_suffix: Vec<u32> = (0..words.len() as u32).collect();
        by_suffix.sort_unstable_by(|&a, &b| cmp_reversed(vocab.word(a), vocab.word(b)));
        vocab.by_suffix = by_suffix;
        (vocab, order)
    }

    pub fn len(&self) -> usize {
        self.offsets.len() - 1
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn word(&self, id: u32) -> &[u8] {
        let i = id as usize;
        &self.bytes[self.offsets[i] as usize..self.offsets[i + 1] as usize]
    }

    /// Bytes held: the packed text plus the two `u32` arrays.
    pub fn heap_bytes(&self) -> usize {
        self.bytes.capacity() + 4 * (self.offsets.capacity() + self.by_suffix.capacity())
    }

    /// The ID of `word`, if present, and how many comparisons it took.
    pub fn lookup_counting(&self, word: &str) -> (Option<u32>, u32) {
        let target = word.as_bytes();
        let mut comparisons = 0;
        let i = partition(self.len(), |i| {
            comparisons += 1;
            self.word(i as u32) < target
        });
        let found = i < self.len() && self.word(i as u32) == target;
        (found.then_some(i as u32), comparisons)
    }

    pub fn lookup(&self, word: &str) -> Option<u32> {
        let target = word.as_bytes();
        let i = partition(self.len(), |i| self.word(i as u32) < target);
        (i < self.len() && self.word(i as u32) == target).then_some(i as u32)
    }

    /// The IDs of the words starting with `prefix`: a contiguous range.
    pub fn prefix_range(&self, prefix: &str) -> Range<u32> {
        let p = prefix.as_bytes();
        let lo = partition(self.len(), |i| self.word(i as u32) < p);
        let n = partition(self.len() - lo, |k| {
            self.word((lo + k) as u32).starts_with(p)
        });
        lo as u32..(lo + n) as u32
    }

    /// The IDs of the words ending with `suffix` (in reversed-spelling order).
    pub fn suffix_ids(&self, suffix: &str) -> &[u32] {
        let s = suffix.as_bytes();
        let ids = &self.by_suffix;
        let lo = partition(ids.len(), |i| {
            cmp_reversed(self.word(ids[i]), s) == Ordering::Less
        });
        let n = partition(ids.len() - lo, |k| self.word(ids[lo + k]).ends_with(s));
        &ids[lo..lo + n]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocab() -> SortedVocab {
        SortedVocab::build(&[
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

    fn words(v: &SortedVocab, ids: impl IntoIterator<Item = u32>) -> Vec<String> {
        ids.into_iter()
            .map(|id| String::from_utf8(v.word(id).to_vec()).unwrap())
            .collect()
    }

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
    }

    #[test]
    fn prefix_and_suffix() {
        let v = vocab();
        assert_eq!(
            words(&v, v.prefix_range("bell")),
            ["bello", "bellum", "bellumque"]
        );
        assert_eq!(words(&v, v.prefix_range("amo")), ["amo", "amor"]);
        assert!(v.prefix_range("x").is_empty());
        assert_eq!(
            words(&v, v.suffix_ids("ratio").iter().copied()),
            ["ratio", "oratio"]
        );
        assert_eq!(
            words(&v, v.suffix_ids("oratio").iter().copied()),
            ["oratio"]
        );
        assert_eq!(
            words(&v, v.suffix_ids("tio").iter().copied()),
            ["ratio", "oratio"]
        );
        assert_eq!(
            words(&v, v.suffix_ids("que").iter().copied()),
            ["bellumque"]
        );
        assert!(v.suffix_ids("xyz").is_empty());
    }
}
