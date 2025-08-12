use crate::bitmask_in_place_utils::bitmask_or_with_self_offset_in_place;

pub fn to_bitmask(indices: &[u32], upper_bound: u32) -> Vec<u64> {
    let mut bitmask = vec![0u64; ((upper_bound + 63) / 64).try_into().unwrap()];
    for &idx in indices {
        let word = idx / 64;
        let bit = idx % 64;
        bitmask[word as usize] |= 1 << bit;
    }
    bitmask
}


/// Performs a bit smear on the given bitmask with the specified window size and direction.
///
/// This operates on a bit level. If the original bitmask has a bit set at position `i`,
/// the smeared bitmask will have bits set in the range:
/// - If direction is "left": [i - window, i].
/// - If direction is "right": [i, i + window].
/// - If direction is "both": [i - window, i + window].
///
/// # Arguments
///
/// * `original` - The original bitmask to smear.
/// * `window` - The size of the window to use for smearing. The maximum value is 15.
/// * `direction` - The direction to smear the bits ("left", "right", or "both").
///
/// # Returns
///
/// The smeared bitmask.
pub fn smear_bitmask(original: &[u64], window: usize, direction: &str) -> Vec<u64> {
    assert!(window > 0 && window < 16, "Window must be in (0, 16).");
    let sign = if direction == "left" { -1 } else { 1 };
    let mut result = original.to_vec();
    bitmask_or_with_self_offset_in_place(&mut result, sign);
    let mut r = 1;
    while r < window {
        let offset = std::cmp::min(r, window - r);
        bitmask_or_with_self_offset_in_place(&mut result, (offset as isize) * sign);
        r += offset;
    }
    // If the direction is "both", we did the smear to the right and now
    // we just need to apply a single left smear to complete the operation.
    if direction == "both" {
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
        let smeared = smear_bitmask(&original, 3, "right");
        let expected = to_bitmask(&[5, 6, 7, 8], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_left_within_a_single_word() {
        let original = to_bitmask(&[5], 64);
        let smeared = smear_bitmask(&original, 3, "left");
        let expected = to_bitmask(&[2, 3, 4, 5], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_in_both_directions_within_a_single_word() {
        let original = to_bitmask(&[5], 64);
        let smeared = smear_bitmask(&original, 2, "both");
        let expected = to_bitmask(&[3, 4, 5, 6, 7], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_right_across_word_boundaries() {
        let original = to_bitmask(&[62], 128);
        let smeared = smear_bitmask(&original, 3, "right");
        let expected = to_bitmask(&[62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_to_the_left_across_word_boundaries() {
        let original = to_bitmask(&[65], 128);
        let smeared = smear_bitmask(&original, 3, "left");
        let expected = to_bitmask(&[62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_smear_in_both_directions_across_word_boundaries() {
        let original = to_bitmask(&[63], 128);
        let smeared = smear_bitmask(&original, 2, "both");
        let expected = to_bitmask(&[61, 62, 63, 64, 65], 128);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_right() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 2, "right");
        let expected = to_bitmask(&[5, 6, 7, 15, 16, 17], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_left() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 2, "left");
        let expected = to_bitmask(&[3, 4, 5, 13, 14, 15], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_multiple_bits_set_smearing_both() {
        let original = to_bitmask(&[5, 15], 64);
        let smeared = smear_bitmask(&original, 1, "both");
        let expected = to_bitmask(&[4, 5, 6, 14, 15, 16], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_overlapping_smears() {
        let original = to_bitmask(&[5, 8], 64);
        let smeared = smear_bitmask(&original, 2, "right");
        let expected = to_bitmask(&[5, 6, 7, 8, 9, 10], 64);
        assert_eq!(smeared, expected);
    }

    #[test]
    fn should_handle_overlapping_smears_with_both() {
        let original = to_bitmask(&[5, 8], 64);
        let smeared = smear_bitmask(&original, 2, "both");
        let expected = to_bitmask(&[3, 4, 5, 6, 7, 8, 9, 10], 64);
        assert_eq!(smeared, expected);
    }
}
