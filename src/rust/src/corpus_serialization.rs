use crate::common::{
    deserialize_u64_vec_from_bytes, PackedBitMask, PackedIndexData,
};
use serde::{
    de::{self, Deserializer, MapAccess, Visitor},
    Deserialize,
};
use std::collections::HashMap;
use std::error::Error;
use std::fmt;
use std::fs;
use std::path::Path;

const MAP_TOKEN: &str = "___SERIALIZED_KEY_v1____MAP";
const BIT_MASK_TOKEN: &str = "___SERIALIZED_KEY_v1____BIT_MASK";

#[derive(Debug, Deserialize)]
pub struct CorpusStats {
    #[serde(rename = "totalWords")]
    pub total_words: u64,
    #[serde(rename = "totalWorks")]
    pub total_works: u64,
    #[serde(rename = "uniqueWords")]
    pub unique_words: u64,
    #[serde(rename = "uniqueLemmata")]
    pub unique_lemmata: u64,
}

#[derive(Debug, Deserialize)]
pub struct WorkData {
    pub author: String,
    pub name: String,
}

pub type WorkLookupEntry = (String, Vec<Vec<String>>, WorkData);
pub type WorkRowRange = (u32, Vec<(u32, u32, u32)>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatinCorpusIndex {
    pub work_lookup: Vec<WorkLookupEntry>,
    pub work_row_ranges: Vec<WorkRowRange>,
    pub stats: CorpusStats,
    pub raw_text_db: String,
    #[serde(deserialize_with = "deserialize_indices")]
    pub indices: HashMap<String, HashMap<String, PackedIndexData>>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum StoredMapValue {
    Base64(String),
    BitMask {
        #[serde(rename = "serializationKey")]
        serialization_key: String,
        data: String,
        size: usize,
    },
}

#[derive(Deserialize)]
struct SerializedMap {
    #[serde(rename = "serializationKey")]
    _serialization_key: String,
    #[serde(rename = "numTokens")]
    _num_tokens: u64,
    data: Vec<(serde_json::Value, StoredMapValue)>,
}

fn deserialize_indices<'de, D>(
    deserializer: D,
) -> Result<HashMap<String, HashMap<String, PackedIndexData>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct IndicesVisitor;

    impl<'de> Visitor<'de> for IndicesVisitor {
        type Value = HashMap<String, HashMap<String, PackedIndexData>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map of serialized index maps")
        }

        fn visit_map<V>(self, mut map: V) -> Result<Self::Value, V::Error>
        where
            V: MapAccess<'de>,
        {
            let mut outer_map = HashMap::new();
            while let Some((key, value)) = map.next_entry::<String, serde_json::Value>()? {
                let serialized_map: SerializedMap =
                    serde_json::from_value(value).map_err(de::Error::custom)?;

                if serialized_map._serialization_key != MAP_TOKEN {
                    return Err(de::Error::custom("Invalid map token"));
                }

                let mut inner_map = HashMap::new();
                for (k, v) in serialized_map.data {
                    let map_key = if let Some(s) = k.as_str() {
                        s.to_string()
                    } else if k.is_number() {
                        k.to_string()
                    } else {
                        return Err(de::Error::custom(
                            "Map key must be a string or a number",
                        ));
                    };
                    let packed_data = match v {
                        StoredMapValue::Base64(b64_data) => {
                            let bytes = base64::decode(b64_data).map_err(de::Error::custom)?;
                            PackedIndexData::PackedNumbers(bytes)
                        }
                        StoredMapValue::BitMask {
                            serialization_key,
                            data,
                            size,
                        } => {
                            if serialization_key != BIT_MASK_TOKEN {
                                return Err(de::Error::custom("Invalid bitmask token"));
                            }
                            let bytes = base64::decode(data).map_err(de::Error::custom)?;
                            let u64_data = deserialize_u64_vec_from_bytes(&bytes)
                                .map_err(de::Error::custom)?;

                            PackedIndexData::PackedBitMask(PackedBitMask {
                                format: "bitmask".to_string(),
                                data: u64_data,
                                num_set: Some(size),
                            })
                        }
                    };
                    inner_map.insert(map_key, packed_data);
                }
                outer_map.insert(key, inner_map);
            }
            Ok(outer_map)
        }
    }

    deserializer.deserialize_map(IndicesVisitor)
}

pub fn deserialize_corpus<P: AsRef<Path>>(
    path: P,
) -> Result<LatinCorpusIndex, Box<dyn Error>> {
    let json_string = fs::read_to_string(path)?;
    let corpus = serde_json::from_str(&json_string)?;
    Ok(corpus)
}