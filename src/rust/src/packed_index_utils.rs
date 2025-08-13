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

/// Returns the numbers that are present in both input arrays, applying an offset to the second array.
/// and which has a maximum fuzz distance applied.
///
/// For example, if the first array is [3, 8, 9], the second array is [0, 11], and the offset is 1
/// and the maxDistance is 2, the result will be [3] because the [0] in the second array is offset by
/// 1 to 1, which is within the maxDistance of 2 from 3. On the other hand, 11 + 1 = 12, which is
/// not within the maxDistance of 2 from 9.
///
/// This implementation assumes that both input arrays are sorted in ascending order.
///
/// # Arguments
///
/// * `first` - The first array of numbers.
/// * `second` - The second array of numbers.
/// * `offset` - The offset to apply to the second array.
/// * `max_distance` - The maximum distance to consider a match.
/// * `direction` - The direction to apply the fuzzy distance.
///
/// # Returns
///
/// A new array with the elements of the first array that match the second array.
pub fn find_fuzzy_matches_with_arrays(
    first: &[u32],
    second: &[u32],
    offset: i32,
    max_distance: u32,
    direction: &str,
) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let left_fuzz = if direction == "right" { 0 } else { max_distance };
    let right_fuzz = if direction == "left" { 0 } else { max_distance };
    let mut i = 0;
    let mut j = 0;

    while i < first.len() && j < second.len() {
        let first_val = first[i] as i64;
        let second_val = second[j] as i64 + offset as i64;

        // Consider the window of maxDistance around secondVal:
        // [secondVal - maxDistance, secondVal + maxDistance]
        // There are three cases:
        // - firstVal is to the left of the window, so we increment i and try
        //   to find a larger firstVal.
        // - firstVal is to the right of the window, so we increment j and try
        //   to find a larger secondVal.
        // - firstVal is within the window, so we add it to the results and
        //   increment just i and see if we are still in the same window.
        if first_val < second_val - left_fuzz as i64 {
            i += 1;
            continue;
        }
        if first_val > second_val + right_fuzz as i64 {
            j += 1;
            continue;
        }
        results.push(first[i]);
        i += 1;
    }

    results
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

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_consecutive_first_elements_matching_one_second_element_both() {
        let first = vec![10, 11];
        let second = vec![9];
        let offset = 0;
        let max_distance = 2;
        // The match window for `second` element 9 is [7, 11].
        // Both 10 and 11 from `first` fall within this window.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&first, &second, offset, max_distance, "both"),
            vec![10, 11]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_the_first_array_is_empty() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[], &[1, 2, 3], 0, 1, "both"),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_the_second_array_is_empty() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 2, 3], &[], 0, 1, "both"),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_no_matches_are_found() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 2, 3], &[10, 11, 12], 0, 1, "both"),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_zero_offset_and_zero_distance() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 5, 10], &[1, 6, 10], 0, 0, "both"),
            vec![1, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_a_non_zero_offset_and_zero_distance() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 7, 12], &[1, 6, 10], 2, 0, "both"),
            vec![3, 12]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_a_zero_offset_both() {
        // second becomes [1, 12].
        // 3 is in range of 1 (1-2 to 1+2 => [-1, 3]).
        // 8,9 are not in range of 12 (12-2 to 12+2 => [10, 14]).
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 8, 9], &[0, 11], 1, 2, "both"),
            vec![3]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_a_non_zero_offset_both() {
        // second becomes [4, 9, 19].
        // 5 is in range of 4. 10 is in range of 9. 15 is not in range of 19.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 10, 15], &[3, 8, 18], 1, 1, "both"),
            vec![5, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_first_array_both() {
        // first: [10], second: [8, 9, 10] -> offset 0, dist 1.
        // second vals are 8,9,10. 10 matches all of them.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[10], &[8, 9, 10], 0, 1, "both"),
            vec![10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_second_array_both() {
        // first: [8, 9, 10], second: [9] -> offset 0, dist 1.
        // second val is 9. Its range [8, 10] matches all elements in first.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[8, 9, 10], &[9], 0, 1, "both"),
            vec![8, 9, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_overlapping_fuzzy_matches_both() {
        // first: [5, 6], second: [7], offset: 0, dist: 2.
        // second val is 7. Its range [5, 9] matches both 5 and 6.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 6], &[7], 0, 2, "both"),
            vec![5, 6]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_complex_cases_with_multiple_overlapping_matches_both() {
        // first: [10, 11, 15, 20], second: [12, 18], offset: 0, dist: 2.
        // second val 12: range [10, 14]. Matches 10, 11.
        // second val 18: range [16, 20]. Matches 20. (15 is not in range).
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[10, 11, 15, 20], &[12, 18], 0, 2, "both"),
            vec![10, 11, 20]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_another_complex_case_correctly_both() {
        let first = vec![10, 20, 30, 40, 50];
        let second = vec![12, 33, 48];
        // second val 12: range [9, 15]. Matches 10.
        // second val 33: range [30, 36]. Matches 30.
        // second val 48: range [45, 51]. Matches 50.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&first, &second, 0, 3, "both"),
            vec![10, 30, 50]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_the_case_from_the_original_code_comments_both() {
        // first: [3, 8, 9], second: [0, 11], offset: 1, maxDistance: 2.
        // second becomes [1, 12].
        // second val 1: range [-1, 3]. Matches 3.
        // second val 12: range [10, 14]. No matches.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 8, 9], &[0, 11], 1, 2, "both"),
            vec![3]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_direction_right() {
        // second val 5: range [5, 7]. Matches 5, 7.
        // second val 10: range [10, 12]. Matches 10.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 7, 9, 10], &[5, 10], 0, 2, "right"),
            vec![5, 7, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_direction_left() {
        // second val 5: range [3, 5]. Matches 3, 5.
        // second val 10: range [8, 10]. Matches 9, 10.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 5, 7, 9, 10], &[5, 10], 0, 2, "left"),
            vec![3, 5, 9, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_no_matches_if_direction_restricts_range_right() {
        // second val 10: range [10, 12]. No match for 9.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[9], &[10], 0, 2, "right"),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_no_matches_if_direction_restricts_range_left() {
        // second val 10: range [8, 10]. No match for 11.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[11], &[10], 0, 2, "left"),
            Vec::<u32>::new()
        );
    }
}
