use crate::{common::IndexData, packed_arrays};

impl IndexData {
    /// Returns a human-readable label for the type of IndexData.
    pub fn label(&self) -> String {
        match self {
            IndexData::PackedNumbers(_) => "PackedNumbers".to_string(),
            IndexData::PackedBitMask(_) => "PackedBitMask".to_string(),
            IndexData::Unpacked(_) => "Unpacked".to_string(),
        }
    }

    /// Returns the number of elements in the index.
    pub fn num_elements(&self) -> usize {
        match self {
            IndexData::PackedNumbers(data) => packed_arrays::num_elements(data),
            IndexData::PackedBitMask(bitmask_data) => bitmask_data
                .data
                .iter()
                .map(|x| x.count_ones() as usize)
                .sum(),
            IndexData::Unpacked(data) => data.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::PackedBitMask;

    fn pack_nats(numbers: &[u32]) -> Vec<u8> {
        packed_arrays::pack_sorted_nats(numbers).unwrap()
    }

    #[test]
    fn num_elements_unpacked_should_return_length() {
        let data = IndexData::Unpacked(vec![1, 2, 3, 4, 5]);
        assert_eq!(data.num_elements(), 5);
    }

    #[test]
    fn num_elements_unpacked_empty_should_return_zero() {
        let data = IndexData::Unpacked(vec![]);
        assert_eq!(data.num_elements(), 0);
    }

    #[test]
    fn num_elements_packed_numbers_should_return_correct_count() {
        let numbers = vec![10, 20, 30, 40];
        let packed = pack_nats(&numbers);
        let data = IndexData::PackedNumbers(packed);
        assert_eq!(data.num_elements(), 4);
    }

    #[test]
    fn num_elements_packed_numbers_empty_should_return_zero() {
        let numbers = vec![];
        let packed = pack_nats(&numbers);
        let data = IndexData::PackedNumbers(packed);
        assert_eq!(data.num_elements(), 0);
    }

    #[test]
    fn num_elements_packed_bitmask_should_return_set_bits_count() {
        // Bitmask with bits set at positions 0, 1, 63 (across two u64 words)
        let bitmask_data = vec![0b11, 0b1 << 63]; // 2 bits in first word, 1 in second
        let data = IndexData::PackedBitMask(PackedBitMask {
            data: bitmask_data,
            
        });
        assert_eq!(data.num_elements(), 3);
    }

    #[test]
    fn num_elements_packed_bitmask_all_zero_should_return_zero() {
        let bitmask_data = vec![0u64, 0u64];
        let data = IndexData::PackedBitMask(PackedBitMask {
            data: bitmask_data,
            
        });
        assert_eq!(data.num_elements(), 0);
    }

    #[test]
    fn num_elements_packed_bitmask_single_word_should_return_correct_count() {
        let bitmask_data = vec![0b10101010]; // 4 bits set
        let data = IndexData::PackedBitMask(PackedBitMask {
            data: bitmask_data,
            
        });
        assert_eq!(data.num_elements(), 4);
    }
}
