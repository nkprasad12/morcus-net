pub fn to_bitmask(indices: &[u32], upper_bound: u32) -> Vec<u64> {
    let mut bitmask = vec![0u64; ((upper_bound + 63) / 64).try_into().unwrap()];
    for &idx in indices {
        let word = idx / 64;
        let bit = idx % 64;
        bitmask[word as usize] |= 1 << bit;
    }
    bitmask
}
