#[derive(Debug, PartialEq, Clone)]
pub enum IndexData {
    PackedNumbers(Vec<u8>),
    PackedBitMask(PackedBitMask),
    Unpacked(Vec<u32>),
}

#[derive(Debug, PartialEq, Clone)]
pub struct PackedBitMask {
    pub data: Vec<u64>,
    pub num_set: Option<usize>,
}

pub fn deserialize_u64_vec_from_bytes(bytes: &[u8]) -> Result<Vec<u64>, String> {
    if bytes.len() % 8 != 0 {
        return Err(format!(
            "invalid length: {}, expected a byte slice whose length is a multiple of 8",
            bytes.len()
        ));
    }
    let u64_vec: Vec<u64> = bytes
        .chunks_exact(8)
        .map(|chunk| -> Result<u64, String> {
            let arr: [u8; 8] = chunk
                .try_into()
                .map_err(|_| "slice with incorrect length".to_string())?;
            Ok(u64::from_le_bytes(arr))
        })
        .collect::<Result<Vec<u64>, String>>()?;

    Ok(u64_vec)
}
