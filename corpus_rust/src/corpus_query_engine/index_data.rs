use std::cmp::{max, min};

use crate::bitmask_utils::{self, Direction};

#[derive(Debug, PartialEq, Eq)]
pub struct IndexRange {
    // The start of the range, inclusive.
    pub start: u32,
    // The end of the range, exclusive.
    pub end: u32,
}

impl IndexRange {
    pub fn has_word_bounds(&self) -> bool {
        self.start.is_multiple_of(64) && self.end.is_multiple_of(64)
    }
}

#[derive(Debug, PartialEq)]
pub struct IndexSlice<'a> {
    pub data: IndexDataRoO<'a>,
    pub range: &'a IndexRange,
    pub position: u32,
}

impl<'s> IndexSlice<'s> {
    pub fn to_ref(&'s self) -> IndexSlice<'s> {
        IndexSlice {
            data: IndexDataRoO::Ref(self.data.to_ref()),
            range: self.range,
            position: self.position,
        }
    }

    pub fn from<'a>(
        index: &IndexData<'a>,
        range: &'a IndexRange,
        position: u32,
    ) -> Result<IndexSlice<'a>, String> {
        if range.start >= range.end {
            return Err("Range start must be less than range end".to_string());
        }
        if !range.has_word_bounds() {
            return Err("Range must be aligned to 64-bit word boundaries".to_string());
        }
        let data = match index {
            IndexData::BitMask(bitmask) => {
                let start_word = (range.start / 64) as usize;
                let end_word = min((range.end / 64) as usize, bitmask.len());
                IndexDataRoO::Ref(IndexData::BitMask(&bitmask[start_word..end_word]))
            }
            IndexData::List(list) => {
                // We use binary search instead of partition_point because we know these are unique.
                let start_idx = list.binary_search(&range.start).unwrap_or_else(|x| x);
                // +1 - 1 because: in the case where the number is not found in the index, we want that point
                // to be the end of the range. If the number *is* found, then the end range is exclusive, so we
                // want to exclude it (thus the -1).
                let end_idx = list.binary_search(&range.end).unwrap_or_else(|x| x + 1) - 1;
                IndexDataRoO::Ref(IndexData::List(&list[start_idx..end_idx]))
            }
        };
        Ok(IndexSlice {
            data,
            range,
            position,
        })
    }
}

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

#[derive(Debug, PartialEq)]
pub(super) enum IndexDataRoO<'a> {
    Ref(IndexData<'a>),
    Owned(IndexDataOwned),
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
fn apply_and_with_bitmask_and_array(
    bitmask: &[u64],
    indices: &[u32],
    offset: i32,
    bitmask_start: u32,
) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let bitmask_end = bitmask.len() * 64 + bitmask_start as usize;
    let mut i = 0;
    while i < indices.len() && (indices[i] as i64 + offset as i64) < bitmask_start as i64 {
        i += 1;
    }
    let mut j = indices.len();
    while j > 0 && (indices[j - 1] as i64 + offset as i64) >= bitmask_end as i64 {
        j -= 1;
    }

    for &id in &indices[i..j] {
        // We don't need any range checks here because of the while loops above.
        let effective_index = (id as i64 + offset as i64) as u32;
        let bitmask_index = effective_index - bitmask_start;
        let word_index = (bitmask_index / 64) as usize;
        let bit_index = bitmask_index % 64;
        if (bitmask[word_index] & (1 << bit_index)) != 0 {
            results.push(effective_index);
        }
    }
    results
}

/// Computes the bitwise AND of a bitmask and a vector of ids in list format, with an offset.
fn apply_or_with_bitmask_and_array(
    bitmask: &[u64],
    list: &[u32],
    offset: i32,
    bitmask_start: u32,
) -> Result<Vec<u64>, String> {
    if list.is_empty() {
        return Ok(bitmask.to_vec());
    }
    let offset = offset as i64;
    let bitmask_end = bitmask.len() * 64 + bitmask_start as usize;
    if list[list.len() - 1] as i64 + offset >= bitmask_end as i64 {
        return Err("Offset results in index out of bounds".to_string());
    }
    let mut i = 0;
    while i < list.len() && (list[i] as i64 + offset) < bitmask_start as i64 {
        i += 1;
    }

    let mut result = bitmask.to_vec();
    while i < list.len() {
        let offset_id = list[i] as i64 + offset;
        // We know this is positive because of the while loop above.
        let bitmask_id = (offset_id - bitmask_start as i64) as usize;
        let word_index = bitmask_id / 64;
        if word_index >= result.len() {
            break;
        }
        let bit_index = bitmask_id % 64;
        result[word_index] |= 1 << bit_index;
        i += 1;
    }
    Ok(result)
}

/// Returns the numbers that are present in both input arrays, applying an offset to the second array.
pub(super) fn apply_and_with_arrays(first: &[u32], second: &[u32], offset: i32) -> Vec<u32> {
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
/// ## Arguments
///
/// * `first` - The first sorted array of numbers.
/// * `second` - The second sorted array of numbers.
/// * `offset` - The offset to apply to each element of the `second` array.
///
/// ## Returns
///
/// A new sorted array containing the merged elements.
pub(super) fn apply_or_with_arrays(first: &[u32], second: &[u32], offset: i32) -> Vec<u32> {
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
pub fn apply_and_to_indices<'a, 'b>(
    first: &IndexSlice<'a>,
    second: &IndexSlice<'b>,
) -> Result<IndexSlice<'a>, String> {
    // TODO: We actually can, and it's not that hard.
    if first.range != second.range {
        return Err("Cannot apply AND to indices with different ranges".to_string());
    }
    let offset = first.position as i32 - second.position as i32;

    let (index, position) = match (first.data.to_ref(), second.data.to_ref()) {
        (IndexData::BitMask(bm1), IndexData::BitMask(bm2)) => {
            let data = bitmask_utils::apply_and_with_bitmasks(bm1, bm2, offset as isize);
            let result = IndexDataOwned::BitMask(data);
            (result, first.position)
        }
        (IndexData::BitMask(bm), IndexData::List(arr)) => {
            let overlaps = apply_and_with_bitmask_and_array(bm, arr, offset, first.range.start);
            (IndexDataOwned::List(overlaps), first.position)
        }
        (IndexData::List(arr), IndexData::BitMask(bm)) => {
            let overlaps = apply_and_with_bitmask_and_array(bm, arr, -offset, second.range.start);
            (IndexDataOwned::List(overlaps), second.position)
        }
        (IndexData::List(arr1), IndexData::List(arr2)) => {
            let overlaps = apply_and_with_arrays(arr1, arr2, offset);
            (IndexDataOwned::List(overlaps), first.position)
        }
    };
    Ok(IndexSlice {
        data: IndexDataRoO::Owned(index),
        range: first.range,
        position,
    })
}

pub fn apply_or_to_indices<'a, 'b>(
    first: &IndexSlice<'a>,
    second: &IndexSlice<'b>,
) -> Result<IndexSlice<'a>, String> {
    // TODO: We actually can, and it's not that hard.
    if first.range != second.range {
        return Err("Cannot apply AND to indices with different ranges".to_string());
    }
    let offset = first.position as i32 - second.position as i32;

    let (index, position) = match (first.data.to_ref(), second.data.to_ref()) {
        (IndexData::BitMask(bm1), IndexData::BitMask(bm2)) => {
            let data = bitmask_utils::apply_or_with_bitmasks(bm1, bm2, offset as isize);
            let result = IndexDataOwned::BitMask(data);
            (result, first.position)
        }
        (IndexData::BitMask(bm), IndexData::List(arr)) => {
            let overlaps = apply_or_with_bitmask_and_array(bm, arr, offset, first.range.start)?;
            (IndexDataOwned::BitMask(overlaps), first.position)
        }
        (IndexData::List(arr), IndexData::BitMask(bm)) => {
            let overlaps = apply_or_with_bitmask_and_array(bm, arr, -offset, second.range.start)?;
            (IndexDataOwned::BitMask(overlaps), second.position)
        }
        (IndexData::List(arr1), IndexData::List(arr2)) => {
            let overlaps = apply_or_with_arrays(arr1, arr2, offset);
            (IndexDataOwned::List(overlaps), first.position)
        }
    };
    Ok(IndexSlice {
        data: IndexDataRoO::Owned(index),
        range: first.range,
        position,
    })
}

/// Returns the matches that are within a maximum fuzz distance applied.
///
/// The results are always returned relative to the `first` index and its positioning.
pub fn find_fuzzy_matches<'a>(
    first: &IndexSlice<'a>,
    second: &IndexSlice<'a>,
    max_dist: usize,
    dir: Direction,
) -> Result<IndexSlice<'a>, String> {
    if max_dist == 0 || max_dist >= 16 {
        return Err("max_distance must be between 1 and 15".to_string());
    }
    let offset = first.position as i32 - second.position as i32;

    let index = match (first.data.to_ref(), second.data.to_ref()) {
        (IndexData::BitMask(bm1), IndexData::BitMask(bm2)) => {
            let result = find_fuzzy_matches_with_bitmasks(bm1, bm2, offset as isize, max_dist, dir);
            IndexDataOwned::BitMask(result)
        }
        (IndexData::BitMask(bm), IndexData::List(arr)) => {
            let overlaps = find_fuzzy_matches_with_bitmask_and_array(
                bm,
                arr,
                offset,
                max_dist,
                dir,
                first.range.start,
            );
            IndexDataOwned::BitMask(overlaps)
        }
        (IndexData::List(arr), IndexData::BitMask(bm)) => {
            // Negative because the offset is applied to the array.
            let overlaps = find_fuzzy_matches_with_array_and_bitmask(
                arr,
                bm,
                -offset,
                max_dist,
                dir,
                first.range.start,
            );
            IndexDataOwned::List(overlaps)
        }
        (IndexData::List(arr1), IndexData::List(arr2)) => {
            let overlaps = find_fuzzy_matches_with_arrays(arr1, arr2, offset, max_dist, dir);
            IndexDataOwned::List(overlaps)
        }
    };
    Ok(IndexSlice {
        data: IndexDataRoO::Owned(index),
        range: first.range,
        position: first.position,
    })
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
/// ## Arguments
///
/// * `first` - The first array of numbers.
/// * `second` - The second array of numbers.
/// * `offset` - The offset to apply to the second array.
/// * `max_distance` - The maximum distance to consider a match.
/// * `direction` - The direction to apply the fuzzy distance.
///
/// ## Returns
///
/// A new array with the elements of the first array that match the second array.
fn find_fuzzy_matches_with_arrays(
    first: &[u32],
    second: &[u32],
    offset: i32,
    max_distance: usize,
    direction: Direction,
) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let left_fuzz = match direction {
        Direction::Right => 0,
        _ => max_distance,
    };
    let right_fuzz = match direction {
        Direction::Left => 0,
        _ => max_distance,
    };

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

/// Finds the positions in the first bitmask that are within the specified distance
/// of positions in the second bitmask, considering the given offset.
///
/// ## Arguments
///
/// * `first` - The first bitmask.
/// * `second` - The second bitmask to match against. Must have the same length as `first`.
/// * `offset` - The offset to apply to the second bitmask.
/// * `max_distance` - The maximum distance to consider a match.
/// * `direction` - The direction to apply the fuzzy distance (Left, Right, or Both).
///
/// ## Returns
///
/// A new bitmask containing the positions in the first bitmask that match the fuzzy criteria.
fn find_fuzzy_matches_with_bitmasks(
    first: &[u64],
    second: &[u64],
    offset: isize,
    max_distance: usize,
    direction: Direction,
) -> Vec<u64> {
    assert_eq!(
        first.len(),
        second.len(),
        "Bitmasks must have the same length."
    );

    let smeared_second = bitmask_utils::smear_bitmask(second, max_distance, direction);
    bitmask_utils::apply_and_with_bitmasks(first, &smeared_second, offset)
}

/// Finds the elements in the array that are within the specified distance
/// of set bits in the bitmask, considering the given offset.
///
/// ## Arguments
///
/// * `bitmask` - The bitmask to check against.
/// * `array` - The array of indices.
/// * `offset` - The offset to apply to the array elements. Can be positive or negative.
/// * `max_distance` - The maximum distance to consider a match.
/// * `direction` - The direction to apply the fuzzy distance.
///
/// ## Returns
///
/// A new array containing the elements from the input array that match the fuzzy criteria.
fn find_fuzzy_matches_with_array_and_bitmask(
    array: &[u32],
    bitmask: &[u64],
    offset: i32,
    max_distance: usize,
    direction: Direction,
    bitmask_start: u32,
) -> Vec<u32> {
    let mut results: Vec<u32> = Vec::new();
    let bitmask_end_bit = bitmask.len() * 64 + bitmask_start as usize;

    // Smear the bitmask according to the max_distance and direction
    let smeared_bitmask = bitmask_utils::smear_bitmask(bitmask, max_distance, direction);

    for &index in array {
        let effective_index = index as i64 + offset as i64 - bitmask_start as i64;
        if effective_index < 0 || effective_index as usize >= bitmask_end_bit {
            continue;
        }

        let word_index = (effective_index / 64) as usize;
        let bit_index = effective_index % 64;

        if (smeared_bitmask[word_index] & (1u64 << bit_index)) != 0 {
            results.push(index);
        }
    }

    results
}

/// Finds the elements in the array that are within the specified distance
/// of set bits in the bitmask, considering the given offset.
///
/// ## Arguments
///
/// * `bitmask` - The bitmask to check against.
/// * `array` - The array of indices.
/// * `offset` - The offset to apply to the array elements. Can be positive or negative.
/// * `max_distance` - The maximum distance to consider a match.
/// * `direction` - The direction to apply the fuzzy distance.
///
/// ## Returns
///
/// A new bitmask containing the elements from the input bitmask that match the fuzzy criteria.
fn find_fuzzy_matches_with_bitmask_and_array(
    bitmask: &[u64],
    array: &[u32],
    offset: i32,
    max_distance: usize,
    direction: Direction,
    bitmask_start: u32,
) -> Vec<u64> {
    let mut result: Vec<u64> = vec![0; bitmask.len()];

    let final_bit = bitmask.len() * 64 - 1;
    let extend_left = direction != Direction::Right;
    let extend_right = direction != Direction::Left;
    let left_mod = if extend_left { max_distance } else { 0 };
    let right_mod = if extend_right { max_distance } else { 0 };
    for index in array {
        let effective_index = *index as i64 + offset as i64 - bitmask_start as i64;
        let start = effective_index - left_mod as i64;
        let end = effective_index + right_mod as i64;
        if end < 0 || start as usize > final_bit {
            continue;
        }
        let start = max(0, start) as usize;
        let end = min(end, final_bit as i64) as usize;
        // TODO: Optimize this to copy a whole range using bitwise operations.
        // We want to copy the bits from start to end (inclusive) from bitmask to result.
        for bit in start..=end {
            let word_index = bit / 64;
            let bit_index = bit % 64;
            result[word_index] |= bitmask[word_index] & (1u64 << bit_index);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use crate::bitmask_utils::{
        Direction::{Both, Left, Right},
        from_bitmask, to_bitmask,
    };

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
            find_fuzzy_matches_with_arrays(&first, &second, offset, max_distance, Both),
            vec![10, 11]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_the_first_array_is_empty() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[], &[1, 2, 3], 0, 1, Both),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_the_second_array_is_empty() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 2, 3], &[], 0, 1, Both),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_return_an_empty_array_if_no_matches_are_found() {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 2, 3], &[10, 11, 12], 0, 1, Both),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_zero_offset_and_zero_distance()
    {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[1, 5, 10], &[1, 6, 10], 0, 0, Both),
            vec![1, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_exact_matches_with_a_non_zero_offset_and_zero_distance()
     {
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 7, 12], &[1, 6, 10], 2, 0, Both),
            vec![3, 12]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_a_zero_offset_both() {
        // second becomes [1, 12].
        // 3 is in range of 1 (1-2 to 1+2 => [-1, 3]).
        // 8,9 are not in range of 12 (12-2 to 12+2 => [10, 14]).
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 8, 9], &[0, 11], 1, 2, Both),
            vec![3]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_a_non_zero_offset_both() {
        // second becomes [4, 9, 19].
        // 5 is in range of 4. 10 is in range of 9. 15 is not in range of 19.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 10, 15], &[3, 8, 18], 1, 1, Both),
            vec![5, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_first_array_both()
     {
        // first: [10], second: [8, 9, 10] -> offset 0, dist 1.
        // second vals are 8,9,10. 10 matches all of them.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[10], &[8, 9, 10], 0, 1, Both),
            vec![10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_multiple_matches_for_a_single_element_in_the_second_array_both()
     {
        // first: [8, 9, 10], second: [9] -> offset 0, dist 1.
        // second val is 9. Its range [8, 10] matches all elements in first.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[8, 9, 10], &[9], 0, 1, Both),
            vec![8, 9, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_handle_overlapping_fuzzy_matches_both() {
        // first: [5, 6], second: [7], offset: 0, dist: 2.
        // second val is 7. Its range [5, 9] matches both 5 and 6.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 6], &[7], 0, 2, Both),
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
            find_fuzzy_matches_with_arrays(&[10, 11, 15, 20], &[12, 18], 0, 2, Both),
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
            find_fuzzy_matches_with_arrays(&first, &second, 0, 3, Both),
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
            find_fuzzy_matches_with_arrays(&[3, 8, 9], &[0, 11], 1, 2, Both),
            vec![3]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_direction_right() {
        // second val 5: range [5, 7]. Matches 5, 7.
        // second val 10: range [10, 12]. Matches 10.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[5, 7, 9, 10], &[5, 10], 0, 2, Right),
            vec![5, 7, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_fuzzy_matches_with_direction_left() {
        // second val 5: range [3, 5]. Matches 3, 5.
        // second val 10: range [8, 10]. Matches 9, 10.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[3, 5, 7, 9, 10], &[5, 10], 0, 2, Left),
            vec![3, 5, 9, 10]
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_no_matches_if_direction_restricts_range_right() {
        // second val 10: range [10, 12]. No match for 9.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[9], &[10], 0, 2, Right),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn find_fuzzy_matches_with_arrays_should_find_no_matches_if_direction_restricts_range_left() {
        // second val 10: range [8, 10]. No match for 11.
        assert_eq!(
            find_fuzzy_matches_with_arrays(&[11], &[10], 0, 2, Left),
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
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 0, 0);
        assert_eq!(result, vec![1, 4]);
    }

    #[test]
    fn apply_and_with_bitmask_and_array_positive_offset() {
        let bitmask = to_bitmask(&[1, 3, 4, 6], 64);
        let indices = vec![0, 2, 3, 6];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 1, 0);
        assert_eq!(result, vec![1, 3, 4]);
    }

    #[test]
    fn apply_and_with_bitmask_and_array_word_boundaries() {
        let bitmask = to_bitmask(&[63, 64, 127], 128);
        let indices = vec![60, 61, 62, 63, 64, 65];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 0, 0);
        assert_eq!(result, vec![63, 64]);
    }

    #[test]
    fn apply_or_with_bitmask_and_array_no_offset() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let indices = vec![0, 2, 4];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 0, 0);
        let expected = to_bitmask(&[0, 1, 2, 3, 4], 64);
        assert_eq!(result, Ok(expected));
    }

    #[test]
    fn apply_and_with_bitmask_and_array_bitmask_start_nonzero() {
        // bitmask relative positions [1,6] with bitmask_start=64 represent absolute [65,70]
        let bitmask = to_bitmask(&[1, 6], 128);
        let indices = vec![60, 65, 70, 72];
        let result = apply_and_with_bitmask_and_array(&bitmask, &indices, 0, 64);
        assert_eq!(result, vec![65, 70]);
    }

    #[test]
    fn apply_or_with_bitmask_and_array_positive_offset() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let indices = vec![0, 2, 5];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 1, 0);
        let expected = to_bitmask(&[1, 3, 4, 6], 64);
        assert_eq!(result, Ok(expected));
    }

    #[test]
    fn apply_or_with_bitmask_and_array_resize() {
        let bitmask = to_bitmask(&[10], 64);
        let indices = vec![70];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 0, 0);

        assert!(result.is_err());
    }

    const DEFAULT_RANGE: IndexRange = IndexRange { start: 0, end: 192 };
    fn to_slice<'a>(index: IndexData<'a>, position: u32) -> IndexSlice<'a> {
        IndexSlice {
            data: IndexDataRoO::Ref(index),
            range: &DEFAULT_RANGE,
            position,
        }
    }

    fn to_slice_bitmask(indices: &[u32], bound: u32, position: u32) -> IndexSlice<'_> {
        let bitmask = to_bitmask(indices, bound);
        IndexSlice {
            data: IndexDataRoO::Owned(IndexDataOwned::BitMask(bitmask)),
            range: &DEFAULT_RANGE,
            position,
        }
    }

    fn to_slice_list(indices: &[u32], position: u32) -> IndexSlice<'_> {
        IndexSlice {
            data: IndexDataRoO::Owned(IndexDataOwned::List(indices.to_vec())),
            range: &DEFAULT_RANGE,
            position,
        }
    }

    #[test]
    fn apply_or_to_indices_array_array() {
        let candidates = to_slice(IndexData::List(&[3, 6, 9]), 2);
        let filter_data = to_slice(IndexData::List(&[2, 4, 8]), 1);

        let result = apply_or_to_indices(&candidates, &filter_data).unwrap();

        // candidates: [3,6,9], filter: [3,5,9] -> union [3,5,6,9]
        assert_eq!(result, to_slice_list(&[3, 5, 6, 9], 2));
    }

    #[test]
    fn apply_or_to_indices_bitmask_array() {
        let candidates = to_slice_bitmask(&[1, 3, 4], 64, 1);
        let filter_data = to_slice(IndexData::List(&[0, 2, 3]), 0);

        let result = apply_or_to_indices(&candidates, &filter_data).unwrap();

        // bitmask: [1,3,4], array with offset: [1,3,4] -> union [1,3,4]
        assert_eq!(result, to_slice_bitmask(&[1, 3, 4], 64, 1));
    }

    #[test]
    fn apply_or_to_indices_array_bitmask() {
        let candidates = to_slice(IndexData::List(&[1, 2, 5]), 0);
        let filter_data = to_slice_bitmask(&[1, 3, 4], 64, 1);

        let result = apply_or_to_indices(&candidates, &filter_data).unwrap();

        assert_eq!(result, to_slice_bitmask(&[1, 2, 3, 4, 6], 64, 1));
    }

    #[test]
    fn apply_or_with_bitmask_and_array_bitmask_start_nonzero() {
        // indices [64,66,69] with offset 1 become [65,67,70] -> bitmask relative [1, 3, 6]
        let bitmask = to_bitmask(&[1, 3, 4], 128);
        let indices = vec![64, 66, 69];
        let result = apply_or_with_bitmask_and_array(&bitmask, &indices, 1, 64).unwrap();

        assert_eq!(from_bitmask(&result), &[1, 3, 4, 6]);
    }

    #[test]
    fn apply_or_to_indices_bitmask_bitmask() {
        let candidates = to_slice_bitmask(&[1, 3, 4], 64, 3);
        let filter_data = to_slice_bitmask(&[0, 2, 4], 64, 2);

        let result = apply_or_to_indices(&candidates, &filter_data).unwrap();

        assert_eq!(result, to_slice_bitmask(&[1, 3, 4, 5], 64, 3));
    }

    #[test]
    fn apply_or_to_indices_negative_offset() {
        let candidates = to_slice_bitmask(&[0, 2, 4], 64, 2);
        let filter_data = to_slice_bitmask(&[1, 3, 4], 64, 3);

        let result = apply_or_to_indices(&candidates, &filter_data).unwrap();

        assert_eq!(result, to_slice_bitmask(&[0, 2, 3, 4], 64, 2));
    }

    #[test]
    fn apply_and_to_indices_array_array() {
        let first = to_slice(IndexData::List(&[3, 6, 9]), 2);
        let second = to_slice(IndexData::List(&[2, 4, 8]), 1);

        let result = apply_and_to_indices(&first, &second).unwrap();

        assert_eq!(result, to_slice_list(&[3, 9], 2));
    }

    #[test]
    fn apply_and_to_indices_bitmask_array() {
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let first = to_slice(IndexData::BitMask(&bitmask), 1);
        let second = to_slice(IndexData::List(&[0, 2, 3]), 0);

        let result = apply_and_to_indices(&first, &second).unwrap();

        assert_eq!(result, to_slice_list(&[1, 3, 4], 1));
    }

    #[test]
    fn apply_and_to_indices_array_bitmask() {
        let first: IndexSlice<'_> = to_slice(IndexData::List(&[0, 2, 3]), 0);
        let bitmask = to_bitmask(&[1, 3, 4], 64);
        let second = to_slice(IndexData::BitMask(&bitmask), 1);

        let result = apply_and_to_indices(&first, &second).unwrap();

        assert_eq!(result, to_slice_list(&[1, 3, 4], 1));
    }

    #[test]
    fn apply_and_to_indices_bitmask_bitmask() {
        let bitmask1 = to_bitmask(&[1, 3, 4], 64);
        let bitmask2 = to_bitmask(&[0, 2, 4], 64);
        let first = to_slice(IndexData::BitMask(&bitmask1), 3);
        let second = to_slice(IndexData::BitMask(&bitmask2), 2);

        let result = apply_and_to_indices(&first, &second).unwrap();

        assert_eq!(result, to_slice_bitmask(&[1, 3], 64, 3));
    }

    #[test]
    fn apply_and_to_indices_bitmask_bitmask_negative_offset() {
        let bitmask1 = to_bitmask(&[1, 3, 4], 64);
        let bitmask2 = to_bitmask(&[0, 2, 4], 64);
        let first = to_slice(IndexData::BitMask(&bitmask1), 3);
        let second = to_slice(IndexData::BitMask(&bitmask2), 2);

        let result = apply_and_to_indices(&second, &first).unwrap();

        assert_eq!(result, to_slice_bitmask(&[0, 2], 64, 2));
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_no_offset() {
        let first = to_bitmask(&[5, 10, 15], 64);
        let second = to_bitmask(&[4, 12], 64);
        // With max_distance 1, first[5] should match second[4], first[10] should not match anything,
        // and first[15] should not match second[12] (distance = 3 > 1)
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 0, 1, Both);
        let expected = to_bitmask(&[5], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_with_offset() {
        let first = to_bitmask(&[5, 10, 15], 64);
        let second = to_bitmask(&[4, 12], 64);
        // With offset 1, second becomes [5, 13]
        // With max_distance 2:
        // - first[5] exactly matches second[5]
        // - first[10] is not within distance 2 of any second element
        // - first[15] is within distance 2 of second[13]
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 1, 2, Both);
        let expected = to_bitmask(&[5, 15], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_direction_left() {
        let first = to_bitmask(&[5, 7, 10], 64);
        let second = to_bitmask(&[8], 64);
        // With direction Left, second[8] matches first[5,7] but not first[10]
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 0, 3, Left);
        let expected = to_bitmask(&[5, 7], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_direction_right() {
        let first = to_bitmask(&[5, 7, 10], 64);
        let second = to_bitmask(&[4], 64);
        // With direction Right, second[4] matches first[5,7] but not first[10]
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 0, 3, Right);
        let expected = to_bitmask(&[5, 7], 64);
        assert_eq!(result, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_across_word_boundaries() {
        let first = to_bitmask(&[62, 65, 68], 128);
        let second = to_bitmask(&[64], 128);
        // With max_distance 2 in both directions, second[64] matches first[62,65,66]
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 0, 2, Both);
        let expected = to_bitmask(&[62, 65], 128);
        assert_eq!(result, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmasks_empty_result() {
        let first = to_bitmask(&[5, 10, 15], 64);
        let second = to_bitmask(&[20, 25], 64);
        // No matches within distance
        let result = find_fuzzy_matches_with_bitmasks(&first, &second, 0, 3, Both);
        let expected = to_bitmask(&[], 64);
        assert_eq!(result, expected);
    }

    fn verify_fuzzy_matches_between_array_and_bitmask(
        first: &[u32],
        second: &[u32],
        offset: i32,
        max_distance: usize,
        direction: Direction,
        expected: &[u32],
    ) {
        let upper_bound = 192;
        first.iter().for_each(|&x| assert!(x < upper_bound));
        second.iter().for_each(|&x| assert!(x < upper_bound));

        let first_bitmask = to_bitmask(first, upper_bound);
        let second_bitmask = to_bitmask(second, upper_bound);

        let array_bitmask_result = find_fuzzy_matches_with_array_and_bitmask(
            first,
            &second_bitmask,
            offset,
            max_distance,
            direction,
            0,
        );
        let bitmask_array_result = find_fuzzy_matches_with_bitmask_and_array(
            &first_bitmask,
            second,
            -offset,
            max_distance,
            direction,
            0,
        );
        assert_eq!(
            array_bitmask_result, expected,
            "Array-Bitmask result mismatch"
        );
        assert_eq!(
            from_bitmask(&bitmask_array_result),
            expected,
            "Bitmask-Array result mismatch"
        );
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_no_offset() {
        let first = &[4, 5, 9, 10, 13];
        let second = &[5, 10, 15];
        let expected = &[4, 5, 9, 10];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_with_offset() {
        let first = &[2, 7, 17];
        let second = &[5, 10, 15];
        let expected = &[2, 7];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 2, 2, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_direction_left() {
        let first = &[6, 8, 10, 12, 14];
        let second = &[10];
        let expected = &[8, 10];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 2, Left, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_direction_right() {
        let first = &[6, 8, 10, 12, 14];
        let second = &[10];
        let expected = &[10, 12];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 2, Right, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_negative_offset() {
        let first = &[11, 15];
        let second = &[5, 10];
        let expected = &[11, 15];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, -5, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_across_word_boundaries() {
        let first = &[61, 62, 63, 64, 65];
        let second = &[63];
        let expected = &[62, 63, 64];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_empty_array() {
        let first = &[];
        let second = &[5, 10];
        let expected = &[];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_empty_bitmask() {
        let first = &[5, 10, 15];
        let second = &[];
        let expected = &[];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_empty_array_and_bitmask() {
        let first = &[];
        let second = &[];
        let expected = &[];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_out_of_range() {
        let first = &[100, 190];
        let second = &[5, 10];
        let expected = &[];
        verify_fuzzy_matches_between_array_and_bitmask(first, second, 0, 1, Both, expected);
    }

    #[test]
    fn find_fuzzy_matches_list_list() {
        let first = to_slice(IndexData::List(&[10, 20, 30]), 0);
        let second = to_slice(IndexData::List(&[12, 28]), 0);
        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();
        assert_eq!(result, to_slice_list(&[10, 30], 0));
    }

    #[test]
    fn find_fuzzy_matches_bitmask_bitmask() {
        let first_bm = to_bitmask(&[10, 20, 30], 64);
        let second_bm = to_bitmask(&[12, 28], 64);
        let first = to_slice(IndexData::BitMask(&first_bm), 0);
        let second = to_slice(IndexData::BitMask(&second_bm), 0);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        assert_eq!(result, to_slice_bitmask(&[10, 30], 64, 0));
    }

    #[test]
    fn find_fuzzy_matches_bitmask_list() {
        let first_bm = to_bitmask(&[10, 20, 30], 64);
        let first = to_slice(IndexData::BitMask(&first_bm), 0);
        let second = to_slice(IndexData::List(&[12, 28]), 0);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        assert_eq!(result, to_slice_bitmask(&[10, 30], 64, 0));
    }

    #[test]
    fn find_fuzzy_matches_list_bitmask() {
        let first = to_slice(IndexData::List(&[10, 20, 30]), 0);
        let second_bm = to_bitmask(&[12, 28], 64);
        let second = to_slice(IndexData::BitMask(&second_bm), 0);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        assert_eq!(result, to_slice_list(&[10, 30], 0));
    }

    #[test]
    fn find_fuzzy_matches_list_list_with_offset() {
        let first = to_slice(IndexData::List(&[10, 20, 30]), 5);
        let second = to_slice(IndexData::List(&[10, 26]), 3);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        assert_eq!(result, to_slice_list(&[10, 30], 5));
    }

    #[test]
    fn find_fuzzy_matches_bitmask_bitmask_with_offset() {
        let first_bm = to_bitmask(&[10, 20, 30], 64);
        let second_bm = to_bitmask(&[10, 26], 64);
        let first = to_slice(IndexData::BitMask(&first_bm), 5);
        let second = to_slice(IndexData::BitMask(&second_bm), 3);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        assert_eq!(result, to_slice_bitmask(&[10, 30], 64, 5));
    }

    #[test]
    fn find_fuzzy_matches_bitmask_list_with_offset() {
        let first_bm = to_bitmask(&[10, 20, 30], 64);
        let first = to_slice(IndexData::BitMask(&first_bm), 5);
        let second = to_slice(IndexData::List(&[10, 26]), 3);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        // offset = 2. second list becomes [12, 28].
        assert_eq!(result, to_slice_bitmask(&[10, 30], 64, 5));
    }

    #[test]
    fn find_fuzzy_matches_list_bitmask_with_offset() {
        let first = to_slice(IndexData::List(&[10, 20, 30]), 5);
        let second_bm = to_bitmask(&[10, 26], 64);
        let second = to_slice(IndexData::BitMask(&second_bm), 3);

        let result = find_fuzzy_matches(&first, &second, 2, Both).unwrap();

        // offset = 2. second bitmask is shifted by 2.
        assert_eq!(result, to_slice_list(&[10, 30], 5));
    }

    #[test]
    fn find_fuzzy_matches_with_array_and_bitmask_bitmask_start_nonzero() {
        // bitmask relative [1,6] with start 64 => absolute [65,70]
        // first array contains absolute positions; radius 1 should match 65 and 70
        let first = &[65, 70, 80];
        let second_bitmask = to_bitmask(&[1, 6], 128);
        let result =
            find_fuzzy_matches_with_array_and_bitmask(first, &second_bitmask, 0, 1, Both, 64);
        assert_eq!(result, vec![65, 70]);
    }

    #[test]
    fn find_fuzzy_matches_with_bitmask_and_array_bitmask_start_nonzero() {
        // bitmask relative [1,6] with start 64 => absolute [65,70]
        // array contains absolute positions; radius 1 should produce a bitmask with the relative bits set
        let bitmask = to_bitmask(&[1, 6], 128);
        let array = vec![65u32, 70u32];
        let result = find_fuzzy_matches_with_bitmask_and_array(&bitmask, &array, 0, 1, Both, 64);
        let expected = to_bitmask(&[1, 6], 128);
        assert_eq!(result, expected);
    }
}
