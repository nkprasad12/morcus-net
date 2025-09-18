macro_rules! define_bitmask_or_with_self_offset_in_place {
    (
        $fn_name:ident,
        $iter:expr,
        $first_idx_expr:expr,
        $main_shift:tt,
        $last_shift_op:tt
    ) => {
        /// Applies a bitwise OR operation with a self-offset to the given bitmask data in place.
        fn $fn_name(data: &mut [u64], offset: usize) {
            assert!(offset > 0 && offset < 64, "Offset must be in (0, 64).");
            let len = data.len();
            if len == 0 {
                return;
            }
            let last_shift = 64 - offset;

            // Handle the boundary word separately to avoid range checks and branching in the hot loop.
            let first_idx = $first_idx_expr(len);
            let mut last = data[first_idx];
            data[first_idx] |= data[first_idx] $main_shift offset;

            for i in $iter(len) {
                // Construct the mask, save the current word for the next iteration, and apply the mask.
                let mask = (data[i] $main_shift offset) | (last $last_shift_op last_shift);
                last = data[i];
                data[i] |= mask;
            }
        }
    };
}

define_bitmask_or_with_self_offset_in_place!(
    bitmask_or_with_self_offset_in_place_right,
    |len| 1..len,
    |_len| 0,
    >>,
    <<
);

define_bitmask_or_with_self_offset_in_place!(
    bitmask_or_with_self_offset_in_place_left,
    |len| (0..len - 1).rev(),
    |len| len - 1,
    <<,
    >>
);

/// Applies a bitwise OR operation with a self-offset to the given bitmask data in place.
/// The offset can be positive (right shift) or negative (left shift).
///
/// The original data is modified in place.
///
/// # Arguments
///
/// * `data` - The bitmask data to modify.
/// * `offset` - The offset to apply. The absolute value must be in the range (0, 64).
pub fn bitmask_or_with_self_offset_in_place(data: &mut [u64], offset: isize) {
    if offset > 0 {
        bitmask_or_with_self_offset_in_place_right(data, offset as usize);
    } else {
        bitmask_or_with_self_offset_in_place_left(data, (-offset) as usize);
    }
}

macro_rules! define_apply_op_with_bitmasks {
    ($fn_name:ident, $op:tt, $name:literal) => {
        #[doc = "Computes a bitwise "]
        #[doc = $name]
        /// on two bitmasks with an offset for the second mask.
        ///
        /// # Arguments
        ///
        /// * `first` - The first bitmask as a slice of u64.
        /// * `second` - The second bitmask as a slice of u64. Must have the same length as `first`.
        /// * `offset` - The bit offset to apply to the second bitmask (right shift). Must be non-negative.
        ///
        /// # Returns
        ///
        /// A new `Vec<u64>` with the result of the operation.
        /// `Result[i] = a[i]
        #[doc = $name]
        /// b[i - k]` for each bit `i`.
        pub fn $fn_name(first: &[u64], second: &[u64], offset: usize) -> Vec<u64> {
            assert_eq!(
                first.len(),
                second.len(),
                "Bitmasks must have the same length."
            );
            assert!(first.len() > 0, "Bitmasks must not be empty.");
            let len = first.len();

            let word_offset = offset / 64;
            let bit_offset = offset % 64;
            let mut result = vec![0u64; len];

            if bit_offset == 0 {
                for i in 0..word_offset {
                    result[i] = first[i] $op 0;
                }
                for i in word_offset..len {
                    result[i] = first[i] $op second[i - word_offset];
                }
                return result;
            }

            let left_shift = 64 - bit_offset;
            // The first few words are 0 or would require range checks
            // to do safely, so handle them outside of the loop and then start
            // with `i = word_offset + 1`.
            for i in 0..word_offset {
                result[i] = first[i] $op 0;
            }
            result[word_offset] = first[word_offset] $op (second[0] >> bit_offset);
            for i in (word_offset + 1)..len {
                let j = i - word_offset;
                // Suppose we have (with 4 bit words for brevity):
                // 1st: 0110 1010
                // 2nd: 1101 0110
                // For the example below, we will work on the second word (so i = 1)
                // and assume wordOffset is 0 and bitOffset is 2.

                // Get the right `wordSize - bitOffset` bits and move them to the left:
                // let mask = second[j] >>> bitOffset;
                //      = 0110 >>> 2 = 0001
                // mask |= second[j] >>> bitOffset;

                // Then get the remaining bits from the previous word:
                // mask |= second[j - 1] << leftShift;
                // second[j - 1] << leftShift
                // = 1100 << 2 = 0100
                // Finally, combine them with a bitwise OR:
                // mask |= second[j - 1] << leftShift
                // = 0001 | 0100 = 0101, as expected.
                let mask = (second[j] >> bit_offset) | (second[j - 1] << left_shift);
                result[i] = first[i] $op mask;
            }
            result
        }
    };
}

define_apply_op_with_bitmasks!(apply_and_with_bitmasks, &, "&");
define_apply_op_with_bitmasks!(apply_or_with_bitmasks, |, "|");

/// Finds the index of the next set bit (1) in the bitmask starting from the given index.
/// Returns `None` if no such bit is found.
pub fn next_one_bit(bitmask: &[u64], start: usize) -> Option<usize> {
    let mut word_index = start / 64;
    let mut bit_index = start % 64;
    while word_index < bitmask.len() {
        let word = bitmask[word_index];
        if word != 0 {
            for bit in bit_index..64 {
                if (word & (1 << (63 - bit))) != 0 {
                    return Some(word_index * 64 + bit);
                }
            }
        }
        word_index += 1;
        bit_index = 0;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::packed_index_utils::to_bitmask;

    fn apply_and_with_boolean_arrays(first: &[bool], second: &[bool], offset: usize) -> Vec<bool> {
        let mut result = vec![false; first.len()];
        for i in 0..first.len() {
            if i >= offset {
                result[i] = first[i] && second[i - offset];
            }
        }
        result
    }

    fn apply_or_with_boolean_arrays(first: &[bool], second: &[bool], offset: usize) -> Vec<bool> {
        let mut result = vec![false; first.len()];
        for i in 0..first.len() {
            if i >= offset {
                result[i] = first[i] || second[i - offset];
            } else {
                result[i] = first[i];
            }
        }
        result
    }

    fn verify_results(a: &[u64], b: &[u64], offset: usize, size: usize) {
        let result = apply_and_with_bitmasks(a, b, offset);

        let mut a_bits = vec![false; size];
        for i in 0..size {
            if (a[i / 64] & (1 << (63 - (i % 64)))) != 0 {
                a_bits[i] = true;
            }
        }

        let mut b_bits = vec![false; size];
        for i in 0..size {
            if (b[i / 64] & (1 << (63 - (i % 64)))) != 0 {
                b_bits[i] = true;
            }
        }

        let expected_bits = apply_and_with_boolean_arrays(&a_bits, &b_bits, offset);
        let result_bits_vec = to_bitmask(
            &expected_bits
                .iter()
                .enumerate()
                .filter(|&(_, &v)| v)
                .map(|(i, _)| i as u32)
                .collect::<Vec<_>>(),
            size as u32,
        );

        assert_eq!(result, result_bits_vec);
    }

    fn verify_results_or(a: &[u64], b: &[u64], offset: usize, size: usize) {
        let result = apply_or_with_bitmasks(a, b, offset);

        let mut a_bits = vec![false; size];
        for i in 0..size {
            if (a[i / 64] & (1 << (63 - (i % 64)))) != 0 {
                a_bits[i] = true;
            }
        }

        let mut b_bits = vec![false; size];
        for i in 0..size {
            if (b[i / 64] & (1 << (63 - (i % 64)))) != 0 {
                b_bits[i] = true;
            }
        }

        let expected_bits = apply_or_with_boolean_arrays(&a_bits, &b_bits, offset);
        let result_bits_vec = to_bitmask(
            &expected_bits
                .iter()
                .enumerate()
                .filter(|&(_, &v)| v)
                .map(|(i, _)| i as u32)
                .collect::<Vec<_>>(),
            size as u32,
        );

        assert_eq!(result, result_bits_vec);
    }

    #[test]
    fn apply_op_with_bitmasks_no_offset() {
        let a = vec![0xAAAAAAAAAAAAAAAA, 0xCCCCCCCCCCCCCCCC];
        let b = vec![0xF0F0F0F0F0F0F0F0, 0x0F0F0F0F0F0F0F0F];
        verify_results(&a, &b, 0, 128);
        verify_results_or(&a, &b, 0, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_word_offset() {
        let a = vec![u64::MAX, u64::MAX];
        let b = vec![0x8000000000000001, 0xAAAAAAAAAAAAAAAA];
        verify_results(&a, &b, 64, 128);
        verify_results_or(&a, &b, 64, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_bit_offset_within_word() {
        let a = vec![u64::MAX, u64::MAX];
        let b = vec![0xAAAAAAAAAAAAAAAA, 0xAAAAAAAAAAAAAAAA];
        verify_results(&a, &b, 4, 128);
        verify_results_or(&a, &b, 4, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_all_zeros_mask() {
        let a = vec![u64::MAX, u64::MAX, u64::MAX];
        let b = vec![0, 0, 0];
        verify_results(&a, &b, 0, 192);
        verify_results_or(&a, &b, 0, 192);
    }

    #[test]
    fn apply_op_with_bitmasks_offset_out_of_bounds() {
        let a = vec![u64::MAX, u64::MAX];
        let b = vec![u64::MAX, u64::MAX];
        verify_results(&a, &b, 128, 128);
        verify_results_or(&a, &b, 128, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_above_64_bits_no_offset() {
        let a = vec![
            0b11110000101010101100110000001111,
            0b11111111000011110000111100001111,
            0b10101010101010101010101010101010,
        ];
        let b = vec![
            0b00001111111111111010101001010101,
            0b11111111000011110000111100001111,
            0b11000011110000111100001111000011,
        ];
        verify_results(&a, &b, 0, 192);
        verify_results_or(&a, &b, 0, 192);
    }

    #[test]
    fn apply_op_with_bitmasks_above_64_bits_with_offset() {
        let a = vec![
            0b11110000101010101100110000001111,
            0b11111111000011110000111100001111,
            0b10101010101010101010101010101010,
        ];
        let b = vec![
            0b00001111111111111010101001010101,
            0b11111111000011110000111100001111,
            0b11000011110000111100001111000011,
        ];
        verify_results(&a, &b, 1, 192);
        verify_results_or(&a, &b, 1, 192);
    }

    #[test]
    fn apply_op_with_bitmasks_above_64_bits_with_greater_than_word_offset() {
        let a = vec![
            0b11110000101010101100110000001111,
            0b11111111000011110000111100001111,
            0b10101010101010101010101010101010,
        ];
        let b = vec![
            0b00001111111111111010101001010101,
            0b11111111000011110000111100001111,
            0b11000011110000111100001111000011,
        ];
        verify_results(&a, &b, 65, 192);
        verify_results_or(&a, &b, 65, 192);
    }

    // Tests for next_one_bit
    #[test]
    fn next_one_bit_from_start_with_bit_set() {
        let bitmask = vec![1 << 63]; // Bit 0 set (MSB)
        assert_eq!(next_one_bit(&bitmask, 0), Some(0));
    }

    #[test]
    fn next_one_bit_from_start_no_bits_set() {
        let bitmask = vec![0];
        assert_eq!(next_one_bit(&bitmask, 0), None);
    }

    #[test]
    fn next_one_bit_from_middle_of_word() {
        let bitmask = vec![(1 << 63) | (1 << 62)];
        assert_eq!(next_one_bit(&bitmask, 0), Some(0));
        assert_eq!(next_one_bit(&bitmask, 1), Some(1));
        assert_eq!(next_one_bit(&bitmask, 2), None);
    }

    #[test]
    fn next_one_bit_across_words() {
        let bitmask = vec![0, 1 << 63]; // Bit 64 set
        assert_eq!(next_one_bit(&bitmask, 0), Some(64));
        assert_eq!(next_one_bit(&bitmask, 64), Some(64));
        assert_eq!(next_one_bit(&bitmask, 65), None);
    }

    #[test]
    fn next_one_bit_start_at_exact_bit() {
        let bitmask = vec![1 << 63];
        assert_eq!(next_one_bit(&bitmask, 0), Some(0));
    }

    #[test]
    fn next_one_bit_start_beyond_last_bit() {
        let bitmask = vec![1 << 63];
        assert_eq!(next_one_bit(&bitmask, 1), None);
    }

    #[test]
    fn next_one_bit_multiple_bits_in_word() {
        let bitmask = vec![(1 << 63) | (1 << 60) | (1 << 50)]; // Bits 0, 3, 13 set
        assert_eq!(next_one_bit(&bitmask, 0), Some(0));
        assert_eq!(next_one_bit(&bitmask, 1), Some(3));
        assert_eq!(next_one_bit(&bitmask, 4), Some(13));
        assert_eq!(next_one_bit(&bitmask, 14), None);
    }

    #[test]
    fn next_one_bit_empty_bitmask() {
        let bitmask = vec![];
        assert_eq!(next_one_bit(&bitmask, 0), None);
    }
}
