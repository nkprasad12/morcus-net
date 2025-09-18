use std::error::Error;

use crate::byte_readers::{InMemoryReader, MmapReader, RawByteReader};
use crate::common::{BitMask, IndexData, u32_from_bytes, u64_from_bytes};
use crate::corpus_serialization::StoredMapValue;

pub struct TokenStarts {
    reader: MmapReader,
}

impl TokenStarts {
    pub fn new(token_starts_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = MmapReader::new(token_starts_path)?;
        Ok(TokenStarts { reader })
    }

    pub fn token_start(&self, token_id: u32) -> Result<usize, String> {
        let i = ((token_id * 2) * 4) as usize;
        Ok(u32_from_bytes(self.reader.bytes(i, i + 4))?[0] as usize)
    }

    pub fn break_start(&self, token_id: u32) -> Result<usize, String> {
        let i = ((token_id * 2 + 1) * 4) as usize;
        Ok(u32_from_bytes(self.reader.bytes(i, i + 4))?[0] as usize)
    }
}

pub struct CorpusText {
    reader: MmapReader,
}

impl CorpusText {
    pub fn new(raw_text_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = MmapReader::new(raw_text_path)?;
        Ok(CorpusText { reader })
    }

    pub fn slice(&self, start: usize, end: usize) -> String {
        // We store the starts of each word as byte offsets, so this should always be valid UTF-8.
        unsafe { String::from_utf8_unchecked(self.reader.bytes(start, end).to_vec()) }
    }

    pub fn advise_range(&self, start: usize, end: usize) {
        self.reader.advise_range(start, end);
    }
}

pub struct IndexBuffers {
    reader: InMemoryReader,
}

impl IndexBuffers {
    pub fn new(raw_buffer_path: &str) -> Result<Self, Box<dyn Error>> {
        let reader = InMemoryReader::new(raw_buffer_path)?;
        Ok(IndexBuffers { reader })
    }

    pub fn resolve_index(
        &self,
        data: &StoredMapValue,
        num_tokens: u32,
    ) -> Result<IndexData, String> {
        match data {
            StoredMapValue::Packed { offset, len } => Ok(IndexData::List(
                u32_from_bytes(
                    self.reader
                        .bytes(*offset as usize, (*offset + (4 * *len)) as usize),
                )?
                .to_vec(),
            )),
            StoredMapValue::BitMask { offset, .. } => {
                let num_words = (num_tokens as usize).div_ceil(64);
                let bytes = self
                    .reader
                    .bytes(*offset as usize, *offset as usize + (num_words * 8));
                Ok(IndexData::BitMask(BitMask {
                    data: u64_from_bytes(bytes)?.to_vec(),
                }))
            }
        }
    }

    pub fn num_elements(&self, data: &StoredMapValue) -> u32 {
        match data {
            StoredMapValue::Packed { len, .. } => *len,
            StoredMapValue::BitMask { num_set, .. } => *num_set,
        }
    }
}
