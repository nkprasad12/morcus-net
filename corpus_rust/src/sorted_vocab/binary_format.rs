//! Encoding, opening and validating the vocabulary file.
//!
//! # Binary format (version 1)
//!
//! All integers are little-endian `u32`. Every `u32` array comes before the
//! text, so they are all 4-byte aligned without padding.
//!
//! | Field              | Type              | Notes                                   |
//! | ------------------ | ----------------- | --------------------------------------- |
//! | `magic`            | `[u8; 4]`         | `b"MVCB"`                               |
//! | `version`          | `u32`             | `1`                                     |
//! | `word_count`       | `u32`             | `V`                                     |
//! | `forward_jump`     | `u32[J + 1]`      | `J = NUM_BUCKETS = 757`; see below      |
//! | `suffix_jump`      | `u32[J + 1]`      | see below                               |
//! | `text_offsets`     | `u32[V + 1]`      | word `i` is `text[off[i]..off[i + 1]]`  |
//! | `by_suffix`        | `u32[V]`          | word IDs sorted by reversed bytes       |
//! | `postings_offsets` | `u32[V + 1]`      | word `i`'s postings: `[p[i]..p[i + 1]]` |
//! | `text`             | `u8[off[V]]`      | the words, concatenated in sorted order |
//!
//! The file ends exactly at the end of `text`. Words are unique and strictly
//! increasing in byte order; `text_offsets[0] == 0`; both offset arrays are
//! non-decreasing; `by_suffix` is a permutation of `0..V`, strictly increasing
//! by reversed bytes. `postings_offsets` index the word postings (a `u32`
//! array stored elsewhere); they need not start at 0.
//!

use std::cmp::Ordering;
use std::ops::Range;

use super::jump_table::{NUM_BUCKETS, bucket, check_jump_buckets, check_jump_shape, jump_table};
use super::{SortedVocab, as_u32s, cmp_reversed, forward_key, reversed_key};
use crate::byte_readers::{RawByteReader, ReaderKind, byte_reader, byte_reader_from_vec};

pub const MAGIC: [u8; 4] = *b"MVCB";
pub const VERSION: u32 = 1;

pub(super) const HEADER_BYTES: usize = 12;

impl SortedVocab {
    /// Encodes the vocabulary file for `sorted_words`, which must be strictly
    /// increasing in byte order. `postings_offsets` has `V + 1` non-decreasing
    /// entries: word `i`'s postings are `postings_offsets[i]..[i + 1]`.
    pub fn encode(sorted_words: &[&str], postings_offsets: &[u32]) -> Result<Vec<u8>, String> {
        let words: Vec<&[u8]> = sorted_words.iter().map(|w| w.as_bytes()).collect();
        let v = words.len();
        let word_count = u32::try_from(v).map_err(|_| "too many words".to_string())?;
        if let Some(i) = words.windows(2).position(|w| w[0] >= w[1]) {
            return Err(format!(
                "words {i} and {} are not strictly increasing",
                i + 1
            ));
        }
        if postings_offsets.len() != v + 1 {
            return Err(format!(
                "expected {} postings offsets, got {}",
                v + 1,
                postings_offsets.len()
            ));
        }
        if postings_offsets.windows(2).any(|w| w[0] > w[1]) {
            return Err("postings offsets are not non-decreasing".to_string());
        }

        let mut text_offsets = Vec::with_capacity(v + 1);
        let mut text_len = 0u32;
        text_offsets.push(0);
        for w in &words {
            text_len = u32::try_from(w.len())
                .ok()
                .and_then(|n| text_len.checked_add(n))
                .ok_or("vocabulary text is too long")?;
            text_offsets.push(text_len);
        }
        let mut by_suffix: Vec<u32> = (0..word_count).collect();
        by_suffix.sort_unstable_by(|&a, &b| cmp_reversed(words[a as usize], words[b as usize]));
        let forward_jump = jump_table(words.iter().map(|w| bucket(forward_key(w))));
        let suffix_jump = jump_table(words.iter().map(|w| bucket(reversed_key(w))));

        let mut out = Vec::with_capacity(
            HEADER_BYTES + 4 * (2 * (NUM_BUCKETS + 1) + 3 * v + 2) + text_len as usize,
        );
        out.extend_from_slice(&MAGIC);
        out.extend_from_slice(&VERSION.to_le_bytes());
        out.extend_from_slice(&word_count.to_le_bytes());
        for array in [
            &forward_jump[..],
            &suffix_jump[..],
            &text_offsets[..],
            &by_suffix[..],
            postings_offsets,
        ] {
            for x in array {
                out.extend_from_slice(&x.to_le_bytes());
            }
        }
        for w in &words {
            out.extend_from_slice(w);
        }
        Ok(out)
    }

    /// Builds an in-memory vocabulary from unique `words` in any order, where
    /// word `i` has `postings_counts[i]` postings. Also returns, for each new
    /// ID, the index of that word in `words` (to renumber other indices by).
    pub fn build(words: &[&str], postings_counts: &[u32]) -> Result<(Self, Vec<u32>), String> {
        if words.len() != postings_counts.len() {
            return Err("words and postings counts differ in length".to_string());
        }
        let n = u32::try_from(words.len()).map_err(|_| "too many words".to_string())?;
        let mut order: Vec<u32> = (0..n).collect();
        order.sort_unstable_by(|&a, &b| words[a as usize].cmp(words[b as usize]));
        let sorted: Vec<&str> = order.iter().map(|&i| words[i as usize]).collect();
        let mut postings_offsets = Vec::with_capacity(order.len() + 1);
        let mut total = 0u32;
        postings_offsets.push(0);
        for &i in &order {
            total = total
                .checked_add(postings_counts[i as usize])
                .ok_or("too many postings")?;
            postings_offsets.push(total);
        }
        let vocab = Self::from_bytes(Self::encode(&sorted, &postings_offsets)?)?;
        Ok((vocab, order))
    }

    /// Opens an encoded vocabulary held in memory. Copies it only if it is
    /// not 8-byte aligned (see `byte_reader_from_vec`).
    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self, String> {
        let len = bytes.len();
        Self::from_reader(byte_reader_from_vec(bytes), len)
    }

    /// Opens the vocabulary file at `path`.
    pub(crate) fn open(path: &str, kind: ReaderKind) -> Result<Self, String> {
        if kind == ReaderKind::InMemory {
            return Self::from_bytes(std::fs::read(path).map_err(|e| format!("{path}: {e}"))?);
        }
        let len = std::fs::metadata(path)
            .map_err(|e| format!("{path}: {e}"))?
            .len();
        let len = usize::try_from(len).map_err(|_| format!("{path}: file too large"))?;
        let reader = byte_reader(kind, path).map_err(|e| format!("{path}: {e}"))?;
        Self::from_reader(reader, len)
    }

    /// Opens a vocabulary from `reader`, which must hold exactly `byte_len`
    /// bytes. Checks the header, sizes, alignment and the `u32` tables (one
    /// sequential pass, no allocation, never touching the text), so that
    /// every lookup stays in bounds. `verify_invariants` checks the rest.
    pub(crate) fn from_reader(
        reader: Box<dyn RawByteReader>,
        byte_len: usize,
    ) -> Result<Self, String> {
        if cfg!(target_endian = "big") {
            return Err("SortedVocab requires a little-endian target".to_string());
        }
        if byte_len < HEADER_BYTES {
            return Err("vocabulary is truncated: no header".to_string());
        }
        let header = reader.bytes(0, HEADER_BYTES);
        let field = |i: usize| -> [u8; 4] {
            let mut x = [0u8; 4];
            x.copy_from_slice(&header[i..i + 4]);
            x
        };
        if field(0) != MAGIC {
            return Err("vocabulary has a bad magic number".to_string());
        }
        let version = u32::from_le_bytes(field(4));
        if version != VERSION {
            return Err(format!("unsupported vocabulary version {version}"));
        }
        let v = u32::from_le_bytes(field(8)) as usize;

        let mut cursor = HEADER_BYTES;
        let mut take = |count: Option<usize>| -> Result<Range<usize>, String> {
            let end = count
                .and_then(|c| c.checked_mul(4))
                .and_then(|n| cursor.checked_add(n))
                .filter(|&end| end <= byte_len)
                .ok_or("vocabulary is truncated")?;
            let range = cursor..end;
            cursor = end;
            Ok(range)
        };
        let forward_jump = take(Some(NUM_BUCKETS + 1))?;
        let suffix_jump = take(Some(NUM_BUCKETS + 1))?;
        let text_offsets = take(v.checked_add(1))?;
        let by_suffix = take(Some(v))?;
        let postings_offsets = take(v.checked_add(1))?;
        let text_start = cursor;

        let mut vocab = SortedVocab {
            reader,
            forward_jump,
            suffix_jump,
            text_offsets,
            by_suffix,
            postings_offsets,
            text: text_start..text_start,
        };
        for range in [
            &vocab.forward_jump,
            &vocab.suffix_jump,
            &vocab.text_offsets,
            &vocab.by_suffix,
            &vocab.postings_offsets,
        ] {
            if as_u32s(vocab.reader.bytes(range.start, range.end)).is_none() {
                return Err("vocabulary is not 4-byte aligned".to_string());
            }
        }
        let text_len = vocab.u32s(&vocab.text_offsets).last().copied().unwrap_or(0) as usize;
        let text_end = text_start
            .checked_add(text_len)
            .ok_or("vocabulary is truncated")?;
        if text_end != byte_len {
            return Err(format!(
                "vocabulary should be {text_end} bytes long, but is {byte_len}"
            ));
        }
        vocab.text = text_start..text_end;
        vocab.check_tables(v)?;
        Ok(vocab)
    }

    /// The cheap structural checks run on open.
    fn check_tables(&self, v: usize) -> Result<(), String> {
        let offsets = self.u32s(&self.text_offsets);
        if offsets.len() != v + 1
            || offsets.first() != Some(&0)
            || offsets.windows(2).any(|w| w[0] > w[1])
        {
            return Err("text offsets are not non-decreasing from 0".to_string());
        }
        check_jump_shape("forward_jump", self.u32s(&self.forward_jump), v)?;
        check_jump_shape("suffix_jump", self.u32s(&self.suffix_jump), v)?;
        if self
            .u32s(&self.by_suffix)
            .iter()
            .any(|&id| id as usize >= v)
        {
            return Err("by_suffix has an out-of-range word ID".to_string());
        }
        if self
            .u32s(&self.postings_offsets)
            .windows(2)
            .any(|w| w[0] > w[1])
        {
            return Err("postings offsets are not non-decreasing".to_string());
        }
        Ok(())
    }

    /// Checks the ordering invariants that `open` does not (it would fault in
    /// the whole file with random reads): words strictly increasing,
    /// `by_suffix` a permutation strictly increasing by reversed bytes, and
    /// every key in its jump-table bucket. Violations give wrong results, but
    /// never out-of-bounds reads. For tests and build-time checks.
    pub fn verify_invariants(&self) -> Result<(), String> {
        let words = self.words();
        let all = 0..words.len() as u32;
        if all
            .clone()
            .skip(1)
            .any(|i| words.get(i - 1) >= words.get(i))
        {
            return Err("words are not strictly increasing".to_string());
        }
        check_jump_buckets(
            "forward_jump",
            self.u32s(&self.forward_jump),
            all.map(|i| bucket(forward_key(words.get(i)))),
        )?;
        // `by_suffix` has `V` IDs below `V` (checked on open); strictly
        // increasing distinct words makes them distinct, so a permutation.
        let by_suffix = self.u32s(&self.by_suffix);
        if by_suffix
            .windows(2)
            .any(|w| cmp_reversed(words.get(w[0]), words.get(w[1])) != Ordering::Less)
        {
            return Err("by_suffix is not strictly sorted by reversed spelling".to_string());
        }
        check_jump_buckets(
            "suffix_jump",
            self.u32s(&self.suffix_jump),
            by_suffix
                .iter()
                .map(|&id| bucket(reversed_key(words.get(id)))),
        )
    }
}
