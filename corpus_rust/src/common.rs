use serde::Deserialize;

#[derive(Debug, Deserialize, PartialEq, Clone)]
#[serde(untagged)]
pub enum IndexData {
    PackedNumbers(#[serde(with = "serde_bytes")] Vec<u8>),
    PackedBitMask(PackedBitMask),
    Unpacked(Vec<u32>),
}

#[derive(Debug, Deserialize, PartialEq, Clone)]
pub struct PackedBitMask {
    #[serde(deserialize_with = "deserialize_u64_vec_from_bytes_with_serde")]
    pub data: Vec<u64>,
    #[serde(rename = "numSet")]
    pub num_set: Option<usize>,
}

// Renamed to avoid conflict when calling directly.
fn deserialize_u64_vec_from_bytes_with_serde<'de, D>(deserializer: D) -> Result<Vec<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let bytes: Vec<u8> = serde_bytes::deserialize(deserializer)?;
    deserialize_u64_vec_from_bytes(&bytes).map_err(serde::de::Error::custom)
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
