#[derive(Debug, PartialEq, Clone)]
pub enum IndexData {
    PackedBitMask(PackedBitMask),
    Unpacked(Vec<u32>),
}

#[derive(Debug, PartialEq, Clone)]
pub struct PackedBitMask {
    pub data: Vec<u64>,
}

pub fn u32_from_bytes(bytes: &[u8]) -> Result<&[u32], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u32>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}

pub fn u64_from_bytes(bytes: &[u8]) -> Result<&[u64], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u64>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}
