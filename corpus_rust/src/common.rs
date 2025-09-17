#[derive(Debug, PartialEq, Clone)]
pub enum IndexData {
    PackedNumbers(Vec<u8>),
    PackedBitMask(PackedBitMask),
    Unpacked(Vec<u32>),
}

#[derive(Debug, PartialEq, Clone)]
pub struct PackedBitMask {
    pub data: Vec<u64>,
}

pub fn u64_from_bytes(bytes: &[u8]) -> Result<&[u64], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u64>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}
