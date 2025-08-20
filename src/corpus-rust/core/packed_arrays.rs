//! Utilities for working with packed arrays of sorted natural numbers.
//! The packing scheme uses bit packing with a 1-byte header.

const PACKED_NUMBER_HEADER_SIZE: usize = 1;
const PACKED_NUMBER_HEADER_UNUSED_BITS_MASK: u8 = 0b11100000; // bits 7-5
const PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK: u8 = 0b00011111; // bits 4-0

/// Calculates the number of bits required to store numbers up to `upper_bound`.
pub fn bits_per_number(upper_bound: u32) -> usize {
    if upper_bound <= 1 {
        1
    } else {
        // This is equivalent to `ceil(log2(upper_bound))` for integers.
        (32 - (upper_bound - 1).leading_zeros()) as usize
    }
}

/// Packs an array of sorted natural numbers into a compact bit array (Vec<u8>).
pub fn pack_sorted_nats(numbers: &[u32]) -> Result<Vec<u8>, String> {
    if numbers.is_empty() {
        let header = 0;
        return Ok(vec![header]);
    }

    let upper_bound = numbers[numbers.len() - 1] + 1;
    assert!(upper_bound > 0, "upperBound must be positive.");
    let bits_per_number = bits_per_number(upper_bound);
    assert!(
        bits_per_number <= 31,
        "upperBound too large for packed encoding (max bitsPerNumber = 31)."
    );

    let total_bits = numbers.len() * bits_per_number;
    let data_buffer_size = total_bits.div_ceil(8);
    let unused_bits = data_buffer_size * 8 - total_bits;
    assert!(unused_bits < 8);

    let header = ((unused_bits as u8) << 5) | (bits_per_number as u8);
    let mut buffer = vec![0u8; PACKED_NUMBER_HEADER_SIZE + data_buffer_size];
    buffer[0] = header;

    let mut bit_offset = 0;
    for (i, &num) in numbers.iter().enumerate() {
        if i > 0 && num < numbers[i - 1] {
            return Err("Numbers must be sorted.".to_string());
        }
        if num >= upper_bound {
            return Err(format!(
                "Number {} is out of the allowed range [0, {}).",
                num, upper_bound
            ));
        }
        for j in (0..bits_per_number).rev() {
            let bit = (num >> j) & 1;
            if bit == 1 {
                let byte_index = bit_offset / 8;
                let bit_in_byte = bit_offset % 8;
                buffer[PACKED_NUMBER_HEADER_SIZE + byte_index] |= 1 << (7 - bit_in_byte);
            }
            bit_offset += 1;
        }
    }
    Ok(buffer)
}

/// Unpacks an array of positive integers from a compact bit array (Vec<u8>).
pub fn unpack_integers(buffer: &[u8]) -> Result<Vec<u32>, String> {
    if buffer.len() < PACKED_NUMBER_HEADER_SIZE {
        return Err("Invalid buffer: too small to contain header.".into());
    }
    let header = buffer[0];
    let unused_bits = (header & PACKED_NUMBER_HEADER_UNUSED_BITS_MASK) >> 5;
    let bits_per_number = (header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK) as usize;
    assert!(
        bits_per_number > 0 || buffer.len() == PACKED_NUMBER_HEADER_SIZE,
        "0 bits per number, but buffer contains data."
    );
    if bits_per_number == 0 {
        return Ok(vec![]);
    }

    let data_buffer = &buffer[PACKED_NUMBER_HEADER_SIZE..];
    if data_buffer.is_empty() {
        return Ok(vec![]);
    }

    let total_data_bits = data_buffer.len() * 8;
    let total_valid_bits = total_data_bits - unused_bits as usize;

    let mut numbers: Vec<u32> = Vec::new();
    let mut bit_offset = 0;

    while bit_offset + bits_per_number <= total_valid_bits {
        let mut current_num = 0;
        for j in (0..bits_per_number).rev() {
            let byte_index = bit_offset / 8;
            let bit_in_byte = bit_offset % 8;
            let bit = (data_buffer[byte_index] >> (7 - bit_in_byte)) & 1;
            if bit == 1 {
                current_num |= 1 << j;
            }
            bit_offset += 1;
        }
        numbers.push(current_num);
    }

    Ok(numbers)
}

/// Returns the number of elements in a packed array.
pub fn num_elements(packed_data: &[u8]) -> usize {
    if packed_data.len() < PACKED_NUMBER_HEADER_SIZE {
        return 0;
    }
    let header = packed_data[0];
    let unused_bits = (header & PACKED_NUMBER_HEADER_UNUSED_BITS_MASK) >> 5;
    let bits_per_number = (header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK) as usize;
    if bits_per_number == 0 {
        return 0;
    }
    let total_bits = (packed_data.len() - PACKED_NUMBER_HEADER_SIZE) * 8 - (unused_bits as usize);
    total_bits / bits_per_number
}

/// Gets the value at a specific index from a packed array.
fn get(packed_data: &[u8], index: usize) -> u32 {
    let header = packed_data[0];
    let bits_per_number = (header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK) as usize;
    if bits_per_number == 0 {
        return 0;
    }
    let data_buffer = &packed_data[PACKED_NUMBER_HEADER_SIZE..];
    let mut value: u32 = 0;
    let start_bit = index * bits_per_number;
    for i in 0..bits_per_number {
        let bit_offset = start_bit + i;
        let byte_index = bit_offset / 8;
        let bit_in_byte = bit_offset % 8;
        if byte_index >= data_buffer.len() {
            return 0;
        }
        let bit = (data_buffer[byte_index] >> (7 - bit_in_byte)) & 1;
        if bit == 1 {
            value |= 1 << (bits_per_number - 1 - i);
        }
    }
    value
}

/// Checks if a packed array contains any value within the specified range.
/// This is more efficient than unpacking the entire array by using binary search.
pub fn has_value_in_range(data: &[u8], range: (u32, u32)) -> bool {
    let (low_target, high_target) = range;
    if low_target > high_target {
        return false;
    }
    let num_elements = num_elements(data);
    if num_elements == 0 {
        return false;
    }

    let mut low = 0;
    let mut high = num_elements - 1;

    while low <= high {
        // Avoid overflow with `(low + high) / 2`
        let mid_index = low + (high - low) / 2;
        let mid_val = get(data, mid_index);

        if mid_val < low_target {
            low = mid_index + 1;
        } else if mid_val > high_target {
            if mid_index == 0 {
                return false; // Avoid underflow
            }
            high = mid_index - 1;
        } else {
            // mid_val is within [low_target, high_target]
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip_empty() {
        let packed = pack_sorted_nats(&[]).unwrap();
        assert_eq!(packed, vec![0]);
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(vec![]));
    }

    #[test]
    fn pack_unpack_roundtrip_simple() {
        let numbers = vec![1, 2, 3, 4, 5, 15];
        let packed = pack_sorted_nats(&numbers).unwrap();
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(numbers));
    }

    #[test]
    fn pack_should_compress_data() {
        let numbers = vec![1, 2, 3, 4, 5, 15];
        let packed = pack_sorted_nats(&numbers).unwrap();
        let expected_size = PACKED_NUMBER_HEADER_SIZE
            + (numbers.len() * bits_per_number(numbers[numbers.len() - 1] + 1)).div_ceil(8);
        assert_eq!(packed.len(), expected_size);
    }

    #[test]
    fn pack_unpack_roundtrip_with_padding_equal_to_element_size() {
        let numbers = vec![1, 2, 3, 4, 5, 6, 7];
        let packed = pack_sorted_nats(&numbers).unwrap();
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(numbers));
    }

    #[test]
    fn pack_unpack_roundtrip_with_zero_and_max_value() {
        let numbers = vec![0, 7, 8, 15];
        let packed = pack_sorted_nats(&numbers).unwrap();
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(numbers));
    }

    #[test]
    fn pack_unpack_roundtrip_large_array() {
        let numbers: Vec<u32> = (0..1000).collect();
        let packed = pack_sorted_nats(&numbers).unwrap();
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(numbers));
    }

    #[test]
    fn pack_unpack_roundtrip_upper_bound_one() {
        let numbers = vec![0, 0, 0];
        let packed = pack_sorted_nats(&numbers).unwrap();
        let unpacked = unpack_integers(&packed);
        assert_eq!(unpacked, Ok(numbers));
    }

    #[test]
    fn pack_unpack_roundtrip_various_bit_widths() {
        let test_cases = vec![vec![0, 1, 2, 3, 4, 5, 6], vec![10, 20, 30, 254]];

        for numbers in test_cases {
            let packed = pack_sorted_nats(&numbers).unwrap();
            let unpacked = unpack_integers(&packed);
            assert_eq!(unpacked, Ok(numbers));
        }
    }

    #[test]
    fn pack_should_panic_on_unsorted_input() {
        let packed = pack_sorted_nats(&[3, 2, 5]);
        assert!(packed.is_err());
    }

    #[test]
    fn bits_per_number_should_return_correct_bits() {
        assert_eq!(bits_per_number(1), 1);
        assert_eq!(bits_per_number(2), 1);
        assert_eq!(bits_per_number(3), 2);
        assert_eq!(bits_per_number(4), 2);
        assert_eq!(bits_per_number(8), 3);
        assert_eq!(bits_per_number(9), 4);
        assert_eq!(bits_per_number(1024), 10);
        assert_eq!(bits_per_number(1025), 11);
    }

    #[test]
    fn num_elements_should_return_correct_count() {
        let numbers = vec![1, 2, 3, 4, 5];
        let packed = pack_sorted_nats(&numbers).unwrap();
        assert_eq!(num_elements(&packed), numbers.len());
    }

    #[test]
    fn num_elements_should_return_zero_for_empty() {
        let packed = pack_sorted_nats(&[]).unwrap();
        assert_eq!(num_elements(&packed), 0);
    }

    #[test]
    fn get_should_retrieve_correct_element() {
        let numbers = vec![0, 5, 10, 15, 20, 25, 29];
        let packed = pack_sorted_nats(&numbers).unwrap();
        assert_eq!(get(&packed, 0), 0);
        assert_eq!(get(&packed, 1), 5);
        assert_eq!(get(&packed, 3), 15);
        assert_eq!(get(&packed, 6), 29);
    }

    #[test]
    fn has_value_in_range_should_work_correctly() {
        let numbers = vec![10, 20, 30, 40, 50, 60, 70, 80, 90];
        let packed = pack_sorted_nats(&numbers).unwrap();

        // Single-element range
        assert!(has_value_in_range(&packed, (30, 30)));
        assert!(!has_value_in_range(&packed, (35, 35)));

        // Multi-element range
        assert!(has_value_in_range(&packed, (45, 55)));
        assert!(!has_value_in_range(&packed, (31, 39)));

        // Ranges including boundaries
        assert!(has_value_in_range(&packed, (10, 15)));
        assert!(has_value_in_range(&packed, (85, 90)));

        // Ranges outside the data
        assert!(!has_value_in_range(&packed, (1, 5)));
        assert!(!has_value_in_range(&packed, (95, 105)));
    }

    #[test]
    fn has_value_in_range_should_return_false_for_empty() {
        let empty_packed = pack_sorted_nats(&[]).unwrap();
        assert!(!has_value_in_range(&empty_packed, (10, 20)));
    }
}
