//! The corpus word vocabulary as one sorted, packed, memory-mappable array
//! (`latin_corpus_vocab.bin`).
//!
//! Word IDs are positions in UTF-8 byte order, so:
//! - exact lookup is a binary search;
//! - `prefix*` is a contiguous ID range;
//! - `*suffix` is a contiguous run of `by_suffix` (the IDs sorted by their
//!   reversed bytes);
//! - the postings of any contiguous ID range are one contiguous run of the
//!   word postings, located through `postings_offsets` in O(1).
//!
//! Comparisons are on bytes, so a prefix or suffix match on UTF-8 bytes is
//! also a match on characters.
//!
//! - `binary_format`: the on-disk layout, encoding, opening and validation.
//! - `jump_table`: the 2-byte buckets that narrow every binary search.

mod binary_format;
mod jump_table;
#[cfg(test)]
mod tests;

use std::cmp::Ordering;
use std::ops::Range;

use crate::byte_readers::RawByteReader;
pub use binary_format::{MAGIC, VERSION};
pub use jump_table::NUM_BUCKETS;
use jump_table::{bucket, pattern_buckets};

/// The vocabulary, read in place from its encoded bytes (see `binary_format`).
pub struct SortedVocab {
    reader: Box<dyn RawByteReader>,
    /// Byte ranges of each section within `reader`.
    forward_jump: Range<usize>,
    suffix_jump: Range<usize>,
    text_offsets: Range<usize>,
    by_suffix: Range<usize>,
    postings_offsets: Range<usize>,
    text: Range<usize>,
}

impl SortedVocab {
    pub fn len(&self) -> usize {
        self.words().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The encoded size of the vocabulary, in bytes.
    pub fn byte_len(&self) -> usize {
        self.text.end
    }

    /// The bytes of word `id`, if it exists.
    pub fn word(&self, id: u32) -> Option<&[u8]> {
        ((id as usize) < self.len()).then(|| self.words().get(id))
    }

    /// The ID of `word`, if present.
    pub fn lookup(&self, word: &str) -> Option<u32> {
        let target = word.as_bytes();
        let b = bucket(forward_key(target));
        let range = self.jump_bounds(&self.forward_jump, b..b + 1);
        let words = self.words();
        let i = range.start
            + partition(range.len(), |k| {
                words.get((range.start + k) as u32) < target
            });
        (i < range.end && words.get(i as u32) == target).then_some(i as u32)
    }

    /// The IDs of the words starting with `prefix`: a contiguous range.
    pub fn prefix_range(&self, prefix: &str) -> Range<u32> {
        let p = prefix.as_bytes();
        let range = self.jump_bounds(&self.forward_jump, pattern_buckets(forward_key(p)));
        let words = self.words();
        let start =
            range.start + partition(range.len(), |k| words.get((range.start + k) as u32) < p);
        let n = partition(range.end - start, |k| {
            words.get((start + k) as u32).starts_with(p)
        });
        start as u32..(start + n) as u32
    }

    /// The IDs of the words ending with `suffix`, in reversed-spelling order.
    pub fn suffix_ids_unsorted(&self, suffix: &str) -> &[u32] {
        let s = suffix.as_bytes();
        let range = self.jump_bounds(&self.suffix_jump, pattern_buckets(reversed_key(s)));
        let ids = self.u32s(&self.by_suffix).get(range).unwrap_or(&[]);
        let words = self.words();
        let start = partition(ids.len(), |k| {
            cmp_reversed(words.get(ids[k]), s) == Ordering::Less
        });
        let n = partition(ids.len() - start, |k| {
            words.get(ids[start + k]).ends_with(s)
        });
        &ids[start..start + n]
    }

    /// The IDs of the words ending with `suffix`, in ascending order.
    pub fn suffix_ids_sorted(&self, suffix: &str) -> Vec<u32> {
        let mut ids = self.suffix_ids_unsorted(suffix).to_vec();
        ids.sort_unstable();
        ids
    }

    /// The IDs of the words matching `prefix*suffix`, in ascending order. The
    /// prefix and suffix may not overlap: `ab*ba` does not match `aba`.
    pub fn prefix_suffix_ids_sorted(&self, prefix: &str, suffix: &str) -> Vec<u32> {
        let (p, s) = (prefix.as_bytes(), suffix.as_bytes());
        let min_len = p.len() + s.len();
        let words = self.words();
        let by_prefix = self.prefix_range(prefix);
        let by_suffix = self.suffix_ids_unsorted(suffix);
        if by_prefix.len() <= by_suffix.len() {
            by_prefix
                .filter(|&id| words.byte_len(id) >= min_len && words.get(id).ends_with(s))
                .collect()
        } else {
            // `by_prefix` is exactly the IDs starting with `prefix`.
            let mut ids: Vec<u32> = by_suffix
                .iter()
                .copied()
                .filter(|id| by_prefix.contains(id))
                .collect();
            ids.sort_unstable();
            ids.retain(|&id| words.byte_len(id) >= min_len);
            ids
        }
    }

    /// The postings range of word `word_id`, if it exists.
    pub fn word_postings_range(&self, word_id: u32) -> Option<Range<u32>> {
        self.prefix_postings_range(word_id..word_id.checked_add(1)?)
    }

    pub(crate) fn postings_offsets(&self) -> &[u32] {
        self.u32s(&self.postings_offsets)
    }

    /// The postings range of the contiguous `word_ids` (e.g. a prefix range),
    /// if they exist. Its length is their total number of postings.
    pub fn prefix_postings_range(&self, word_ids: Range<u32>) -> Option<Range<u32>> {
        if word_ids.start > word_ids.end {
            return None;
        }
        let offsets = self.postings_offsets();
        let start = *offsets.get(word_ids.start as usize)?;
        let end = *offsets.get(word_ids.end as usize)?;
        Some(start..end)
    }

    pub fn sum_postings_len(&self, word_ids: &[u32]) -> usize {
        let offsets = self.postings_offsets();
        word_ids
            .iter()
            .filter_map(|&id| {
                let i = id as usize;
                Some(offsets.get(i + 1)?.saturating_sub(*offsets.get(i)?) as usize)
            })
            .sum()
    }

    /// A validated `u32` section (empty only if it was never validated).
    fn u32s(&self, range: &Range<usize>) -> &[u32] {
        as_u32s(self.reader.bytes(range.start, range.end)).unwrap_or(&[])
    }

    fn words(&self) -> Words<'_> {
        Words {
            offsets: self.u32s(&self.text_offsets),
            text: self.reader.bytes(self.text.start, self.text.end),
        }
    }

    /// The sorted positions `jump[buckets.start]..jump[buckets.end]`.
    fn jump_bounds(&self, jump: &Range<usize>, buckets: Range<usize>) -> Range<usize> {
        let jump = self.u32s(jump);
        let at = |k: usize| jump.get(k).map_or(0, |&j| j as usize).min(self.len());
        let start = at(buckets.start);
        start..at(buckets.end).max(start)
    }
}

/// The words, as slices of the mapped file.
#[derive(Clone, Copy)]
struct Words<'a> {
    offsets: &'a [u32],
    text: &'a [u8],
}

impl<'a> Words<'a> {
    fn len(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }

    /// The byte length of word `id`, read from the offsets alone.
    fn byte_len(&self, id: u32) -> usize {
        let i = id as usize;
        match (self.offsets.get(i), self.offsets.get(i + 1)) {
            (Some(&start), Some(&end)) => end.saturating_sub(start) as usize,
            _ => 0,
        }
    }

    /// Word `id`, or empty if `id` is out of range (impossible once validated).
    fn get(&self, id: u32) -> &'a [u8] {
        let i = id as usize;
        match (self.offsets.get(i), self.offsets.get(i + 1)) {
            (Some(&start), Some(&end)) => {
                self.text.get(start as usize..end as usize).unwrap_or(&[])
            }
            _ => &[],
        }
    }
}

fn forward_key(word: &[u8]) -> impl Iterator<Item = u8> + Clone + '_ {
    word.iter().copied()
}

fn reversed_key(word: &[u8]) -> impl Iterator<Item = u8> + Clone + '_ {
    word.iter().rev().copied()
}

fn cmp_reversed(a: &[u8], b: &[u8]) -> Ordering {
    a.iter().rev().cmp(b.iter().rev())
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

/// Reinterprets native-endian (checked to be little-endian on open) bytes.
fn as_u32s(bytes: &[u8]) -> Option<&[u32]> {
    // SAFETY: every bit pattern is a valid `u32`, and `align_to` only puts
    // correctly aligned, whole `u32`s in the middle slice.
    let (head, body, tail) = unsafe { bytes.align_to::<u32>() };
    (head.is_empty() && tail.is_empty()).then_some(body)
}
