use crate::common::IndexData;

impl IndexData {
    pub fn label(&self) -> String {
        match self {
            IndexData::PackedNumbers(_) => "PackedNumbers".to_string(),
            IndexData::PackedBitMask(_) => "PackedBitMask".to_string(),
            IndexData::Unpacked(_) => "Unpacked".to_string(),
        }
    }
}
