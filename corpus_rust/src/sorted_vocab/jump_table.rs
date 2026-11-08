//! The 2-byte jump tables that narrow the binary searches.
//!
//! A key's bucket depends on its first two bytes. For `forward_jump` the key
//! is the word; for `suffix_jump` it is the word's bytes reversed (so `b0` is
//! the last byte and `b1` the second-to-last).
//!
//! ```text
//! bucket(key):
//!   if key is empty:          0
//!   b0 = key[0]
//!   if b0 < 0x61 ('a'):       1                  // one coarse bucket
//!   if b0 > 0x7a ('z'):       756                // one coarse bucket
//!   sub = if key has 1 byte:  0
//!         elif key[1] < 0x61: 1
//!         elif key[1] > 0x7a: 28
//!         else:               2 + (key[1] - 0x61)
//!   return 2 + 29 * (b0 - 0x61) + sub            // 2..=755
//! ```
//!
//! `bucket` is monotonic in byte order (`a <= b` implies `bucket(a) <=
//! bucket(b)`): only exact `b0` values (`a..=z`) are subdivided by `b1`, since
//! subdividing a coarse `b0` group would break order (`"!a" < "0"`).
//!
//! `jump[k]` is the number of keys whose bucket is below `k`, for `k` in
//! `0..=J`; so `jump[0] == 0`, `jump[J] == V`, and the keys in bucket `k` are
//! at positions `jump[k]..jump[k + 1]` of the sorted order (word IDs for
//! `forward_jump`, positions in `by_suffix` for `suffix_jump`).

use std::ops::Range;

/// The number of jump-table buckets (`J`); each table has `J + 1` entries.
pub const NUM_BUCKETS: usize = 757;

const LOW_BUCKET: usize = 1;
const FIRST_LETTER_BUCKET: usize = 2;
const SUB_BUCKETS: usize = 29;
const HIGH_BUCKET: usize = NUM_BUCKETS - 1;

/// The bucket of the key whose bytes are `key` (see the module docs).
pub(super) fn bucket(mut key: impl Iterator<Item = u8>) -> usize {
    let Some(b0) = key.next() else {
        return 0;
    };
    match b0 {
        ..b'a' => LOW_BUCKET,
        b'a'..=b'z' => {
            let sub = match key.next() {
                None => 0,
                Some(..b'a') => 1,
                Some(b1 @ b'a'..=b'z') => 2 + (b1 - b'a') as usize,
                Some(_) => SUB_BUCKETS - 1,
            };
            FIRST_LETTER_BUCKET + SUB_BUCKETS * (b0 - b'a') as usize + sub
        }
        _ => HIGH_BUCKET,
    }
}

/// The buckets that can hold a key starting with `pattern`.
pub(super) fn pattern_buckets(pattern: impl Iterator<Item = u8> + Clone) -> Range<usize> {
    let mut first_two = pattern.clone();
    match (first_two.next(), first_two.next()) {
        (None, _) => 0..NUM_BUCKETS,
        (Some(b0 @ b'a'..=b'z'), None) => {
            let base = FIRST_LETTER_BUCKET + SUB_BUCKETS * (b0 - b'a') as usize;
            base..base + SUB_BUCKETS
        }
        // Either the first two bytes are fixed, or `b0` is in a coarse bucket.
        _ => {
            let b = bucket(pattern);
            b..b + 1
        }
    }
}

/// Builds a jump table from the buckets of all `V` keys (in any order).
pub(super) fn jump_table(buckets: impl Iterator<Item = usize>) -> Vec<u32> {
    let mut jump = vec![0u32; NUM_BUCKETS + 1];
    for b in buckets {
        jump[b + 1] += 1;
    }
    let mut total = 0;
    for j in &mut jump {
        total += *j;
        *j = total;
    }
    jump
}

/// Checks that `jump` has the right length and is non-decreasing from 0 to
/// `len`, so every `jump[k]..jump[k + 1]` is a valid range of `0..len`.
pub(super) fn check_jump_shape(name: &str, jump: &[u32], len: usize) -> Result<(), String> {
    if jump.len() != NUM_BUCKETS + 1
        || jump.first() != Some(&0)
        || jump.last().map(|&j| j as usize) != Some(len)
        || jump.windows(2).any(|w| w[0] > w[1])
    {
        return Err(format!("{name}: malformed jump table"));
    }
    Ok(())
}

/// Checks that each key is within its bucket's range of `jump`, given the
/// keys' buckets in sorted-key order. `jump` must have a valid shape.
pub(super) fn check_jump_buckets(
    name: &str,
    jump: &[u32],
    buckets: impl Iterator<Item = usize>,
) -> Result<(), String> {
    for (i, b) in buckets.enumerate() {
        let start = jump[b] as usize;
        let end = jump[b + 1] as usize;
        if !(start..end).contains(&i) {
            return Err(format!("{name}: key {i} is outside its bucket {b}"));
        }
    }
    Ok(())
}
