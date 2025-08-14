use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum PackedIndexData {
    PackedNumbers(#[serde(with = "serde_bytes")] Vec<u8>),
    PackedBitMask(PackedBitMask),
}

#[derive(Debug, Deserialize, PartialEq, Clone)]
pub struct PackedBitMask {
    pub format: String,
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
    if bytes.len() % 4 != 0 {
        return Err(format!(
            "invalid length: {}, expected a byte slice whose length is a multiple of 4",
            bytes.len()
        ));
    }

    let mut u64_vec = Vec::with_capacity(bytes.len() / 8 + 1);
    // Process full 8-byte chunks
    let mut i = 0;
    while i + 8 <= bytes.len() {
        let value = u64::from_le_bytes([
            bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7],
            bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3],
        ]);
        u64_vec.push(value);
        i += 8;
    }

    // Handle the remainder if there's a 4-byte chunk left
    if i + 4 <= bytes.len() {
        let value = u64::from_le_bytes([
            0, 0, 0, 0,
            bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3],
        ]);
        u64_vec.push(value);
    }

    Ok(u64_vec)
}
