use serde::{
    Deserialize,
    de::{self, Deserializer, MapAccess, Visitor},
};
use std::collections::HashMap;
use std::error::Error;
use std::fmt;
use std::fs;
use std::path::Path;

const MAP_TOKEN: &str = "___SERIALIZED_KEY_v1____MAP";

#[derive(Debug, Deserialize)]
pub struct CorpusStats {
    #[serde(rename = "totalWords")]
    pub total_words: u32,
    #[serde(rename = "totalWorks")]
    pub total_works: u32,
    #[serde(rename = "uniqueWords")]
    pub unique_words: u32,
    #[serde(rename = "uniqueLemmata")]
    pub unique_lemmata: u32,
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
    pub raw_text_path: String,
    pub raw_buffer_path: String,
    pub token_starts: Vec<u32>,
    pub break_starts: Vec<u32>,
    #[serde(deserialize_with = "deserialize_indices")]
    pub indices: HashMap<String, HashMap<String, StoredMapValue>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum StoredMapValue {
    Packed {
        offset: u32,
        len: u32,
    },
    BitMask {
        offset: u32,
        #[serde(rename = "numSet")]
        num_set: u32,
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
) -> Result<HashMap<String, HashMap<String, StoredMapValue>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct IndicesVisitor;

    impl<'de> Visitor<'de> for IndicesVisitor {
        type Value = HashMap<String, HashMap<String, StoredMapValue>>;

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
                        return Err(de::Error::custom("Map key must be a string or a number"));
                    };
                    inner_map.insert(map_key, v);
                }
                outer_map.insert(key, inner_map);
            }
            Ok(outer_map)
        }
    }

    deserializer.deserialize_map(IndicesVisitor)
}

pub fn deserialize_corpus<P: AsRef<Path>>(path: P) -> Result<LatinCorpusIndex, Box<dyn Error>> {
    let json_string = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&json_string)?)
}
