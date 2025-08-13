use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum PackedIndexData {
    PackedNumbers(#[serde(with = "serde_bytes")] Vec<u8>),
    PackedBitMask(PackedBitMask),
}

#[derive(Debug, Deserialize)]
pub struct PackedBitMask {
    pub format: String,
    #[serde(deserialize_with = "deserialize_u64_vec_from_bytes_with_serde")]
    pub data: Vec<u64>,
    #[serde(rename = "numSet")]
    pub num_set: Option<usize>,
}

// Renamed to avoid conflict when calling directly.
fn deserialize_u64_vec_from_bytes_with_serde<'de, D>(
    deserializer: D,
) -> Result<Vec<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let bytes: Vec<u8> = serde_bytes::deserialize(deserializer)?;
    deserialize_u64_vec_from_bytes(&bytes).map_err(serde::de::Error::custom)
}

pub fn deserialize_u64_vec_from_bytes(bytes: &[u8]) -> Result<Vec<u64>, String> {
    if bytes.len() % 4 != 0 {
        return Err(format!(
            "invalid length: {}, expected a byte slice whose length is a multiple of 4",
            bytes.len()
        ));
    }

    let mut u64_vec = Vec::with_capacity(bytes.len() / 8 + 1);
    let mut chunks = bytes.chunks_exact(8);

    for chunk in &mut chunks {
        u64_vec.push(u64::from_le_bytes(chunk.try_into().unwrap()));
    }

    let remainder = chunks.remainder();
    if !remainder.is_empty() {
        let mut padded_chunk = [0u8; 8];
        padded_chunk[..remainder.len()].copy_from_slice(remainder);
        u64_vec.push(u64::from_le_bytes(padded_chunk));
    }

    Ok(u64_vec)
}
