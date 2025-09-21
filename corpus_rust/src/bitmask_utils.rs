#[cfg(test)]
pub fn to_bitmask(indices: &[u32], upper_bound: u32) -> Vec<u64> {
    let mut bitmask = vec![0u64; upper_bound.div_ceil(64).try_into().unwrap()];
    for &idx in indices {
        let word = idx / 64;
        let bit = idx % 64;
        bitmask[word as usize] |= 1 << (63 - bit);
    }
    bitmask
}

#[cfg(test)]
pub fn from_bitmask(bitmask: &[u64]) -> Vec<u32> {
    let mut indices = Vec::new();
    for (word_idx, &word) in bitmask.iter().enumerate() {
        for bit_idx in 0..64 {
            if (word & (1 << (63 - bit_idx))) != 0 {
                let idx = (word_idx * 64 + bit_idx) as u32;
                indices.push(idx);
            }
        }
    }
    indices
}

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
/// ## Arguments
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
        /// ## Arguments
        ///
        /// * `first` - The first bitmask as a slice of u64.
        /// * `second` - The second bitmask as a slice of u64. Must have the same length as `first`.
        /// * `offset` - The bit offset to apply to the second bitmask. Positive values shift right,
        ///   negative values shift left. The absolute value must be less than 64.
        ///
        /// ## Returns
        ///
        /// A new `Vec<u64>` with the result of the operation.
        /// If offset >= 0: `Result[i] = a[i]
        #[doc = $name]
        /// b[i - offset]` for each bit `i`.
        /// If offset < 0: `Result[i] = a[i]
        #[doc = $name]
        /// b[i + |offset|]` for each bit `i`.
        pub fn $fn_name(first: &[u64], second: &[u64], offset: isize) -> Vec<u64> {
            assert_eq!(
                first.len(),
                second.len(),
                "Bitmasks must have the same length."
            );
            assert!(first.len() > 0, "Bitmasks must not be empty.");
            assert!(offset.abs() < 64, "Absolute offset must be less than 64.");
            let len = first.len();

            let mut result = vec![0u64; len];

            if offset == 0 {
                for i in 0..len {
                    result[i] = first[i] $op second[i];
                }
                return result;
            }

            if offset > 0 {
                // Positive offset (shift second bitmask right)
                let offset = offset as usize;
                let left_shift = 64 - offset;
                // Handle the first word separately.
                result[0] = first[0] $op (second[0] >> offset);
                for i in 1..len {
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
                    let mask = (second[i] >> offset) | (second[i - 1] << left_shift);
                    result[i] = first[i] $op mask;
                }
            } else {
                // Negative offset (shift second bitmask left)
                let offset = (-offset) as usize;
                let right_shift = 64 - offset;

                for i in 0..len-1 {
                    let mask = (second[i] << offset) | (second[i + 1] >> right_shift);
                    result[i] = first[i] $op mask;
                }
                // Handle the last word separately
                result[len - 1] = first[len - 1] $op (second[len - 1] << offset);
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

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Direction {
    Left,
    Right,
    Both,
}

/// Performs a bit smear on the given bitmask with the specified window size and direction.
///
/// This operates on a bit level. If the original bitmask has a bit set at position `i`,
/// the smeared bitmask will have bits set in the range:
/// - If direction is SmearDirection::Left: [i - window, i].
/// - If direction is SmearDirection::Right: [i, i + window].
/// - If direction is SmearDirection::Both: [i - window, i + window].
///
/// ## Arguments
///
/// * `original` - The original bitmask to smear.
/// * `window` - The size of the window to use for smearing. The maximum value is 15.
/// * `direction` - The direction to smear the bits (SmearDirection::Left, SmearDirection::Right, or SmearDirection::Both).
///
/// ## Returns
///
/// The smeared bitmask.
pub fn smear_bitmask(original: &[u64], window: usize, direction: Direction) -> Vec<u64> {
    assert!(window > 0 && window < 16, "Window must be in (0, 16).");
    let sign = match direction {
        Direction::Left => -1,
        _ => 1,
    };
    let mut result = original.to_vec();
    bitmask_or_with_self_offset_in_place(&mut result, sign);
    let mut r = 1;
    while r < window {
        let offset = std::cmp::min(r, window - r);
        bitmask_or_with_self_offset_in_place(&mut result, (offset as isize) * sign);
        r += offset;
    }
    // If the direction is Both, we did the smear to the right and now
    // we just need to apply a single left smear to complete the operation.
    if direction == Direction::Both {
        bitmask_or_with_self_offset_in_place(&mut result, -(window as isize));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_smear_to_the_right_within_a_single_word() {
        let original = to_bitmask(&[5], 64);
        let smeared = smear_bitmask(&original, 3, Direction::Right);
        let expected = to_bitmask(&[5, 6, 7, 8], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_left_within_a_single_word() {
        let original = to_bitmask(&[5], 64);
        let smeared = smear_bitmask(&original, 3, Direction::Left);
        let expected = to_bitmask(&[2, 3, 4, 5], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_in_both_directions_within_a_single_word() {
        let original = to_bitmask(&[5], 64);
        let smeared = smear_bitmask(&original, 2, Direction::Both);
        let expected = to_bitmask(&[3, 4, 5, 6, 7], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_right_across_word_boundaries() {
        let original = to_bitmask(&[62], 128);
        let smeared = smear_bitmask(&original, 3, Direction::Right);
        let expected = to_bitmask(&[62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_left_across_word_boundaries() {
        let original = to_bitmask(&[65], 128);
        let smeared = smear_bitmask(&original, 3, Direction::Left);
        let expected = to_bitmask(&[62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_in_both_directions_across_word_boundaries() {
        let original = to_bitmask(&[63], 128);
        let smeared = smear_bitmask(&original, 2, Direction::Both);
        let expected = to_bitmask(&[61, 62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_right() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 2, Direction::Right);
        let expected = to_bitmask(&[5, 6, 7, 15, 16, 17], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_left() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 2, Direction::Left);
        let expected = to_bitmask(&[3, 4, 5, 13, 14, 15], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_both() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 1, Direction::Both);
        let expected = to_bitmask(&[4, 5, 6, 14, 15, 16], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_overlapping_smears() {
        let original = to_bitmask(&[5, 8], 64);
        let smeared = smear_bitmask(&original, 2, Direction::Right);
        let expected = to_bitmask(&[5, 6, 7, 8, 9, 10], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_overlapping_smears_with_both() {
        let original = to_bitmask(&[5, 8], 64);
        let smeared = smear_bitmask(&original, 2, Direction::Both);
        let expected = to_bitmask(&[3, 4, 5, 6, 7, 8, 9, 10], 64);
        assert_eq!(smeared, expected);
    }

    fn apply_and_with_boolean_arrays(first: &[bool], second: &[bool], offset: isize) -> Vec<bool> {
        let mut result = vec![false; first.len()];
        for i in 0..first.len() {
            if offset >= 0 {
                let offset = offset as usize;
                if i >= offset {
                    result[i] = first[i] && second[i - offset];
                }
            } else {
                let offset = (-offset) as usize;
                if i + offset < first.len() {
                    result[i] = first[i] && second[i + offset];
                }
            }
        }
        result
    }

    fn apply_or_with_boolean_arrays(first: &[bool], second: &[bool], offset: isize) -> Vec<bool> {
        let mut result = vec![false; first.len()];
        for i in 0..first.len() {
            if offset >= 0 {
                let offset = offset as usize;
                if i >= offset {
                    result[i] = first[i] || second[i - offset];
                } else {
                    result[i] = first[i];
                }
            } else {
                let offset = (-offset) as usize;
                if i + offset < first.len() {
                    result[i] = first[i] || second[i + offset];
                } else {
                    result[i] = first[i];
                }
            }
        }
        result
    }

    fn verify_results_and(a: &[u64], b: &[u64], offset: isize, size: usize) {
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

    fn verify_results_or(a: &[u64], b: &[u64], offset: isize, size: usize) {
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
        verify_results_and(&a, &b, 0, 128);
        verify_results_or(&a, &b, 0, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_bit_offset_within_word() {
        let a = vec![u64::MAX, u64::MAX];
        let b = vec![0xAAAAAAAAAAAAAAAA, 0xAAAAAAAAAAAAAAAA];
        verify_results_and(&a, &b, 4, 128);
        verify_results_or(&a, &b, 4, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_all_zeros_mask() {
        let a = vec![u64::MAX, u64::MAX, u64::MAX];
        let b = vec![0, 0, 0];
        verify_results_and(&a, &b, 0, 192);
        verify_results_or(&a, &b, 0, 192);
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
        verify_results_and(&a, &b, 0, 192);
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
        verify_results_and(&a, &b, 1, 192);
        verify_results_or(&a, &b, 1, 192);
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

    // New tests for negative offsets
    #[test]
    fn apply_op_with_bitmasks_negative_offset() {
        let a = vec![0xAAAAAAAAAAAAAAAA, 0xCCCCCCCCCCCCCCCC];
        let b = vec![0xF0F0F0F0F0F0F0F0, 0x0F0F0F0F0F0F0F0F];
        verify_results_and(&a, &b, -4, 128);
        verify_results_or(&a, &b, -4, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_bit_negative_offset_within_word() {
        let a = vec![u64::MAX, u64::MAX];
        let b = vec![0xAAAAAAAAAAAAAAAA, 0xAAAAAAAAAAAAAAAA];
        verify_results_and(&a, &b, -4, 128);
        verify_results_or(&a, &b, -4, 128);
    }

    #[test]
    fn apply_op_with_bitmasks_negative_offset_multi_word() {
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
        verify_results_and(&a, &b, -1, 192);
        verify_results_or(&a, &b, -1, 192);
    }

    #[test]
    fn apply_op_with_bitmasks_extreme_negative_offset() {
        let a = vec![
            0b11110000101010101100110000001111,
            0b11111111000011110000111100001111,
        ];
        let b = vec![
            0b00001111111111111010101001010101,
            0b11111111000011110000111100001111,
        ];
        verify_results_and(&a, &b, -63, 128);
        verify_results_or(&a, &b, -63, 128);
    }
}
