use crate::bitmask_utils;

#[derive(Debug, PartialEq, Clone)]
pub(super) enum IndexData<'a> {
    BitMask(&'a [u64]),
    List(&'a [u32]),
}

#[derive(Debug, PartialEq)]
pub(super) enum IndexDataOwned {
    BitMask(Vec<u64>),
    List(Vec<u32>),
}

pub(super) enum IndexDataRoO<'a> {
    Ref(IndexData<'a>),
    Owned(IndexDataOwned),
}

pub(super) struct IntermediateResult<'a> {
    pub data: IndexDataRoO<'a>,
    pub position: u32,
}

impl IndexData<'_> {
    /// Returns the number of elements in the index.
    pub fn num_elements(&self) -> usize {
        match self {
            IndexData::BitMask(bitmask_data) => {
                bitmask_data.iter().map(|x| x.count_ones() as usize).sum()
            }
            IndexData::List(data) => data.len(),
        }
    }
}

impl IndexDataRoO<'_> {
    pub fn to_ref(&'_ self) -> IndexData<'_> {
        match self {
            IndexDataRoO::Ref(r) => r.clone(),
            IndexDataRoO::Owned(o) => match o {
                IndexDataOwned::BitMask(v) => IndexData::BitMask(v),
                IndexDataOwned::List(v) => IndexData::List(v),
            },
        }
    }
}

/// Computes the bitwise AND of a bitmask and an array of indices, with an offset.
pub fn apply_and_with_bitmask_and_array(bitmask: &[u64], indices: &[u32], offset: i32) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let bitmask_len_bits = bitmask.len() * 64;

    for &index in indices {
        let effective_index = index as i64 + offset as i64;
        if effective_index < 0 || effective_index as usize >= bitmask_len_bits {
            continue;
        }
        let word_index = (effective_index / 64) as usize;
        let bit_index = 63 - (effective_index % 64);
        if (bitmask[word_index] & (1 << bit_index)) != 0 {
            results.push(effective_index as u32);
        }
    }
    results
}

/// Computes the bitwise AND of a bitmask and an array of indices, with an offset.
pub fn apply_or_with_bitmask_and_array(bitmask: &[u64], indices: &[u32], offset: i32) -> Vec<u64> {
    let mut result = bitmask.to_vec();
    let mut bitmask_len_bits = result.len() * 64;

    for &index in indices {
        let effective_index = index as i64 + offset as i64;
        if effective_index < 0 {
            continue;
        }
        let effective_index_usize = effective_index as usize;

        if effective_index_usize >= bitmask_len_bits {
            let new_len_words = (effective_index_usize + 64) / 64;
            result.resize(new_len_words, 0);
            bitmask_len_bits = result.len() * 64;
        }

        let word_index = (effective_index / 64) as usize;
        let bit_index = 63 - (effective_index % 64);
        result[word_index] |= 1 << bit_index;
    }
    result
}

/// Returns the numbers that are present in both input arrays, applying an offset to the second array.
pub fn apply_and_with_arrays(first: &[u32], second: &[u32], offset: i32) -> Vec<u32> {
    let mut result: Vec<u32> = Vec::new();
    let mut i = 0;
    let mut j = 0;

    while i < first.len() && j < second.len() {
        let first_val = first[i] as i64;
        let second_val = second[j] as i64 + offset as i64;
        if first_val < second_val {
            i += 1;
        } else if first_val > second_val {
            j += 1;
        } else {
            result.push(first[i]);
            i += 1;
            j += 1;
        }
    }
    result
}

/// Merges two sorted arrays of numbers, applying an offset to the second array.
///
/// This function computes the union of two sorted arrays. An offset is added to each element
/// of the `second` array before the merge. If the offset results in a negative value for an
/// element from the `second` array, that element is ignored. Duplicates are handled, appearing
/// only once in the output.
///
/// # Arguments
///
/// * `first` - The first sorted array of numbers.
/// * `second` - The second sorted array of numbers.
/// * `offset` - The offset to apply to each element of the `second` array.
///
/// # Returns
///
/// A new sorted array containing the merged elements.
pub fn apply_or_with_arrays(first: &[u32], second: &[u32], offset: i32) -> Vec<u32> {
    let mut result: Vec<u32> = Vec::new();
    let mut i = 0;
    let mut j = 0;

    while i < first.len() && j < second.len() {
        let first_val = first[i] as i32;
        let second_val = second[j] as i32 + offset;
        if first_val <= second_val {
            result.push(first[i]);
            i += 1;
            if first_val == second_val {
                j += 1;
            }
            continue;
        }
        if second_val >= 0 {
            result.push(second_val as u32);
        }
        j += 1;
    }
    while i < first.len() {
        result.push(first[i]);
        i += 1;
    }
    while j < second.len() {
        let second_val = second[j] as i32 + offset;
        if second_val >= 0 {
            result.push(second_val as u32);
        }
        j += 1;
    }
    result
}

/// Applies an `and` to determine the intersection between two indices.
pub fn apply_and_to_indices(
    first: &IndexData,
    first_position: u32,
    second: &IndexData,
    second_position: u32,
) -> Result<(IndexDataOwned, u32), String> {
    let offset = first_position as i32 - second_position as i32;

    match (first, second) {
        (IndexData::BitMask(bm1), IndexData::BitMask(bm2)) => {
            let (data, pos) = if offset >= 0 {
                (
                    bitmask_utils::apply_and_with_bitmasks(bm1, bm2, offset as usize),
                    first_position,
                )
            } else {
                (
                    bitmask_utils::apply_and_with_bitmasks(bm2, bm1, (-offset) as usize),
                    second_position,
                )
            };
            let result = IndexDataOwned::BitMask(data);
            Ok((result, pos))
        }
        (IndexData::BitMask(bm), IndexData::List(arr)) => {
            let overlaps = apply_and_with_bitmask_and_array(bm, arr, offset);
            Ok((IndexDataOwned::List(overlaps), first_position))
        }
        (IndexData::List(arr), IndexData::BitMask(bm)) => {
            let overlaps = apply_and_with_bitmask_and_array(bm, arr, -offset);
            Ok((IndexDataOwned::List(overlaps), second_position))
        }
        (IndexData::List(arr1), IndexData::List(arr2)) => {
            let overlaps = apply_and_with_arrays(arr1, arr2, offset);
            Ok((IndexDataOwned::List(overlaps), first_position))
        }
    }
}

pub fn apply_or_to_indices(
    first: &IndexData,
    first_position: u32,
    second: &IndexData,
    second_position: u32,
) -> Result<(IndexDataOwned, u32), String> {
    let offset = first_position as i32 - second_position as i32;

    match (first, second) {
        (IndexData::BitMask(bm1), IndexData::BitMask(bm2)) => {
            let (data, pos) = if offset >= 0 {
                (
                    bitmask_utils::apply_or_with_bitmasks(bm1, bm2, offset as usize),
                    first_position,
                )
            } else {
                (
                    bitmask_utils::apply_or_with_bitmasks(bm2, bm1, (-offset) as usize),
                    second_position,
                )
            };
            let result = IndexDataOwned::BitMask(data);
            Ok((result, pos))
        }
        (IndexData::BitMask(bm), IndexData::List(arr)) => {
            let overlaps = apply_or_with_bitmask_and_array(bm, arr, offset);
            Ok((IndexDataOwned::BitMask(overlaps), first_position))
        }
        (IndexData::List(arr), IndexData::BitMask(bm)) => {
            let overlaps = apply_or_with_bitmask_and_array(bm, arr, -offset);
            Ok((IndexDataOwned::BitMask(overlaps), second_position))
        }
        (IndexData::List(arr1), IndexData::List(arr2)) => {
            let overlaps = apply_or_with_arrays(arr1, arr2, offset);
            Ok((IndexDataOwned::List(overlaps), first_position))
        }
    }
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
#[allow(dead_code)]
pub fn find_fuzzy_matches_with_arrays(
    first: &[u32],
    second: &[u32],
    offset: i32,
    max_distance: u32,
    direction: &str,
) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let left_fuzz = if direction == "right" {
        0
    } else {
        max_distance
    };
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
    use crate::bitmask_utils::to_bitmask;

    use super::*;

    #[test]
    fn num_elements_unpacked_should_return_length() {
        let data = IndexData::List(&[1, 2, 3, 4, 5]);
        assert_eq!(data.num_elements(), 5);
    }

    #[test]
    fn num_elements_unpacked_empty_should_return_zero() {
        let data = IndexData::List(&[]);
        assert_eq!(data.num_elements(), 0);
    }

    #[test]
    fn num_elements_packed_bitmask_should_return_set_bits_count() {
        // Bitmask with bits set at positions 0, 1, 63 (across two u64 words)
        let bitmask_data = vec![0b11, 0b1 << 63]; // 2 bits in first word, 1 in second
        let data = IndexData::BitMask(&bitmask_data);
        assert_eq!(data.num_elements(), 3);
    }

    #[test]
    fn num_elements_packed_bitmask_all_zero_should_return_zero() {
        let bitmask_data = vec![0u64, 0u64];
        let data = IndexData::BitMask(&bitmask_data);
        assert_eq!(data.num_elements(), 0);
    }

    #[test]
    fn num_elements_packed_bitmask_single_word_should_return_correct_count() {
        let bitmask_data = vec![0b10101010]; // 4 bits set
        let data = IndexData::BitMask(&bitmask_data);
        assert_eq!(data.num_elements(), 4);
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_consecutive_first_elements_matching_one_second_element_both()
     {
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
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_zero_offset_and_zero_distance()
    {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 5, 10], &[1, 6, 10], 0, 0, "both"),
            vec![1, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_a_non_zero_offset_and_zero_distance()
     {
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
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_first_array_both()
     {
        // first: [10], second: [8, 9, 10] -> offset 0, dist 1.
        // second vals are 8,9,10. 10 matches all of them.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[10], &[8, 9, 10], 0, 1, "both"),
            vec![10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_second_array_both()
     {
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
    fn find_fuzzy_matches_with_arrays_should_handle_complex_cases_with_multiple_overlapping_matches_both()
     {
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
    fn find_fuzzy_matches_with_arrays_should_handle_the_case_from_the_original_code_comments_both()
    {
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

    #[test]
    fn apply_or_with_arrays_no_offset() {
        let first = vec![1, 3, 5, 8, 10];
        let second = vec![3, 4, 5, 9, 10];
        let result = apply_or_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![1, 3, 4, 5, 8, 9, 10]);
    }

    #[test]
    fn apply_or_with_arrays_positive_offset() {
        let first = vec![3, 5, 9, 12];
        let second = vec![1, 3, 7, 10]; // becomes [3, 5, 9, 12]
        let result = apply_or_with_arrays(&first, &second, 2);
        assert_eq!(result, vec![3, 5, 9, 12]);
    }

    #[test]
    fn apply_or_with_arrays_negative_offset() {
        let first = vec![1, 3, 7, 10];
        let second = vec![3, 5, 9, 12]; // becomes [1, 3, 7, 10]
        let result = apply_or_with_arrays(&first, &second, -2);
        assert_eq!(result, vec![1, 3, 7, 10]);
    }

    #[test]
    fn apply_or_with_arrays_with_empty_first() {
        let first = vec![];
        let second = vec![1, 2, 3];
        let result = apply_or_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![1, 2, 3]);
    }

    #[test]
    fn apply_or_with_arrays_with_empty_second() {
        let first = vec![1, 2, 3];
        let second = vec![];
        let result = apply_or_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![1, 2, 3]);
    }

    #[test]
    fn apply_or_with_arrays_with_negative_offset_resulting_in_negative_values() {
        let first = vec![1, 5];
        let second = vec![3, 8]; // becomes [-2, 3]
        let result = apply_or_with_arrays(&first, &second, -5);
        assert_eq!(result, vec![1, 3, 5]);
    }

    #[test]
    fn apply_or_with_arrays_disjoint_sets() {
        let first = vec![1, 2, 3];
        let second = vec![4, 5, 6];
        let result = apply_or_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![1, 2, 3, 4, 5, 6]);
    }

    #[test]
    fn apply_or_with_arrays_interleaved_sets() {
        let first = vec![1, 3, 5, 7];
        let second = vec![2, 4, 6, 8];
        let result = apply_or_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![1, 2, 3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn apply_and_with_arrays_no_offset() {
        let first = vec![1, 3, 5, 8, 10];
        let second = vec![3, 4, 5, 9, 10];
        let result = apply_and_with_arrays(&first, &second, 0);
        assert_eq!(result, vec![3, 5, 10]);
    }

    #[test]
    fn apply_and_with_arrays_positive_offset() {
        let first = vec![3, 5, 9, 12];
        let second = vec![1, 3, 7, 10];
        let result = apply_and_with_arrays(&first, &second, 2);
        assert_eq!(result, vec![3, 5, 9, 12]);
    }

    #[test]
    fn apply_and_with_arrays_negative_offset() {
        let first = vec![1, 3, 7, 10];
        let second = vec![3, 5, 9, 12];
        let result = apply_and_with_arrays(&first, &second, -2);
        assert_eq!(result, vec![1, 3, 7, 10]);
    }

    #[test]
    fn apply_and_with_bitmask_and_array_no_offset() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let indices = vec![0, 1, 2, 4, 6];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 0);
        assert_eq!(result, vec![1, 4]);
    }

    #[test]
    fn apply_and_with_bitmask_and_array_positive_offset() {
        let bitmask = to_bitmask(&[1, 3, 4, 6], 64);
        let indices = vec![0, 2, 3, 6];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 1);
        assert_eq!(result, vec![1, 3, 4]);
    }

    #[test]
    fn apply_and_with_bitmask_and_array_word_boundaries() {
        let bitmask = to_bitmask(&[63, 64, 127], 128);
        let indices = vec![60, 61, 62, 63, 64, 65];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 0);
        assert_eq!(result, vec![63, 64]);
    }

    #[test]
    fn apply_or_with_bitmask_and_array_no_offset() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let indices = vec![0, 2, 4];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 0);
        let expected = to_bitmask(&[0, 1, 2, 3, 4], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn apply_or_with_bitmask_and_array_positive_offset() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let indices = vec![0, 2, 5];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 1);
        let expected = to_bitmask(&[1, 3, 4, 6], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn apply_or_with_bitmask_and_array_resize() {
        let bitmask = to_bitmask(&[10], 64);
        let indices = vec![70];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 0);
        let expected = to_bitmask(&[10, 70], 128);
        assert_eq!(result, expected);
    }

    #[test]
    fn apply_or_to_indices_array_array() {
        let candidates = IndexData::List(&[3, 6, 9]);
        let filter_data = IndexData::List(&[2, 4, 8]);
        let (result, position) = apply_or_to_indices(&candidates, 2, &filter_data, 1).unwrap();
        // candidates: [3,6,9], filter: [3,5,9] -> union [3,5,6,9]
        assert_eq!(result, IndexDataOwned::List(vec![3, 5, 6, 9]));
        assert_eq!(position, 2);
    }

    #[test]
    fn apply_or_to_indices_bitmask_array() {
        let candidates = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let filter_data = IndexData::List(&[0, 2, 3]);
        let (result, position) = apply_or_to_indices(&candidates, 1, &filter_data, 0).unwrap();
        // bitmask: [1,3,4], array with offset: [1,3,4] -> union [1,3,4]
        let expected_data = to_bitmask(&[1, 3, 4], 64);
        assert_eq!(result, IndexDataOwned::BitMask(expected_data));
        assert_eq!(position, 1);
    }

    #[test]
    fn apply_or_to_indices_array_bitmask() {
        let candidates = IndexData::List(&[1, 2, 5]);
        let filter_data = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let (result, position) = apply_or_to_indices(&candidates, 0, &filter_data, 1).unwrap();
        let expected_data = to_bitmask(&[1, 2, 3, 4, 6], 64);
        assert_eq!(result, IndexDataOwned::BitMask(expected_data));
        assert_eq!(position, 1);
    }

    #[test]
    fn apply_or_to_indices_bitmask_bitmask() {
        let candidates = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let filter_data = IndexData::BitMask(&to_bitmask(&[0, 2, 4], 64));
        let (result, position) = apply_or_to_indices(&candidates, 3, &filter_data, 2).unwrap();
        let expected_data = to_bitmask(&[1, 3, 4, 5], 64);
        assert_eq!(result, IndexDataOwned::BitMask(expected_data));
        assert_eq!(position, 3);
    }

    #[test]
    fn apply_and_to_indices_array_array() {
        let candidates = IndexData::List(&[3, 6, 9]);
        let filter_data = IndexData::List(&[2, 4, 8]);
        let (result, position) = apply_and_to_indices(&candidates, 2, &filter_data, 1).unwrap();
        assert_eq!(result, IndexDataOwned::List(vec![3, 9]));
        assert_eq!(position, 2);
    }

    #[test]
    fn apply_and_to_indices_bitmask_array() {
        let candidates = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let filter_data = IndexData::List(&[0, 2, 3]);
        let (result, position) = apply_and_to_indices(&candidates, 1, &filter_data, 0).unwrap();
        assert_eq!(result, IndexDataOwned::List(vec![1, 3, 4]));
        assert_eq!(position, 1);
    }

    #[test]
    fn apply_and_to_indices_array_bitmask() {
        let candidates = IndexData::List(&[0, 2, 3]);
        let filter_data = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let (result, position) = apply_and_to_indices(&candidates, 0, &filter_data, 1).unwrap();
        assert_eq!(result, IndexDataOwned::List(vec![1, 3, 4]));
        assert_eq!(position, 1);
    }

    #[test]
    fn apply_and_to_indices_bitmask_bitmask() {
        let candidates = IndexData::BitMask(&to_bitmask(&[1, 3, 4], 64));
        let filter_data = IndexData::BitMask(&to_bitmask(&[0, 2, 4], 64));
        let (result, position) = apply_and_to_indices(&candidates, 3, &filter_data, 2).unwrap();
        let expected_data = to_bitmask(&[1, 3], 64);
        assert_eq!(result, IndexDataOwned::BitMask(expected_data));
        assert_eq!(position, 3);
    }
}
