use std::error::Error;

use morceus::inflection_data::WordInflectionData;

use crate::byte_readers::{RawByteReader, ReaderKind, byte_reader};
use crate::corpus_index::{LatinCorpusIndex, StoredMapValue};
use crate::corpus_query_engine::IndexData;

const IN_MEMORY_BUFFERS: &str = "IN_MEMORY";
const MMAP_NO_POPULATE: &str = "MMAP_NO_POPULATE";
const MMAP_POPULATE: &str = "MMAP_POPULATE";

const DEFAULT_READER_KIND: ReaderKind = ReaderKind::MmapPopulated;

fn u32_from_bytes(bytes: &[u8]) -> Result<&[u32], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u32>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}

fn u64_from_bytes(bytes: &[u8]) -> Result<&[u64], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u64>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}

pub struct TokenStarts {
    reader: Box<dyn RawByteReader>,
}

impl TokenStarts {
    fn new(token_starts_path: &str, kind: ReaderKind) -> Result<Self, Box<dyn Error>> {
        let reader = byte_reader(kind, token_starts_path)?;
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
    reader: Box<dyn RawByteReader>,
}

impl CorpusText {
    fn new(raw_text_path: &str, kind: ReaderKind) -> Result<Self, Box<dyn Error>> {
        let reader = byte_reader(kind, raw_text_path)?;
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
    reader: Box<dyn RawByteReader>,
}

impl IndexBuffers {
    fn new(raw_buffer_path: &str, kind: ReaderKind) -> Result<Self, Box<dyn Error>> {
        let reader = byte_reader(kind, raw_buffer_path)?;
        Ok(IndexBuffers { reader })
    }

    pub fn resolve_index(
        &'_ self,
        data: &StoredMapValue,
        num_tokens: u32,
    ) -> Result<IndexData<'_>, String> {
        match data {
            StoredMapValue::Packed { offset, len } => Ok(IndexData::List(u32_from_bytes(
                self.reader
                    .bytes(*offset as usize, (*offset + (4 * *len)) as usize),
            )?)),
            StoredMapValue::BitMask { offset, .. } => {
                let num_words = (num_tokens as usize).div_ceil(64);
                let bytes = self
                    .reader
                    .bytes(*offset as usize, *offset as usize + (num_words * 8));
                Ok(IndexData::BitMask(u64_from_bytes(bytes)?))
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

pub struct InflectionLookup {
    offsets: Box<dyn RawByteReader>,
    data: Box<dyn RawByteReader>,
}

impl InflectionLookup {
    pub fn new(
        offsets_path: &str,
        data_path: &str,
        kind: ReaderKind,
    ) -> Result<Self, Box<dyn Error>> {
        let offsets = byte_reader(kind, offsets_path)?;
        let data = byte_reader(kind, data_path)?;
        Ok(InflectionLookup { offsets, data })
    }

    pub fn get_inflection_data(&self, token_id: u32) -> Result<&[WordInflectionData], String> {
        // The position of each token is stored in the offset table as a u32, so each entry is 4 bytes.
        let offset_index = (token_id as usize) * 4;
        let packed = u32_from_bytes(self.offsets.bytes(offset_index, offset_index + 4))?[0];
        // The high 24 bits are the offset, the low 8 bits are the length. We guarantee at corpus build time
        // that the values fit in these ranges.
        let offset = (packed >> 8) as usize;
        let length = (packed & 0xff) as usize;
        // The offset stores the number of u32s, not the number of bytes.
        let start = offset * 4;
        let end = (offset + length) * 4;
        let data_byte_range = self.data.bytes(start, end);
        u32_from_bytes(data_byte_range)
    }
}

fn choose_reader_kind() -> ReaderKind {
    if std::env::var(IN_MEMORY_BUFFERS).is_ok() {
        ReaderKind::InMemory
    } else if std::env::var(MMAP_NO_POPULATE).is_ok() {
        ReaderKind::Mmap
    } else if std::env::var(MMAP_POPULATE).is_ok() {
        ReaderKind::MmapPopulated
    } else {
        DEFAULT_READER_KIND
    }
}

pub fn data_readers(
    corpus: &LatinCorpusIndex,
) -> Result<(TokenStarts, CorpusText, IndexBuffers, InflectionLookup), Box<dyn Error>> {
    let kind = choose_reader_kind();
    let text = CorpusText::new(&corpus.raw_text_path, kind)?;
    let raw_buffers = IndexBuffers::new(&corpus.raw_buffer_path, kind)?;
    let starts = TokenStarts::new(&corpus.token_starts_path, kind)?;
    let inflections: InflectionLookup = InflectionLookup::new(
        &corpus.inflections_offsets_path,
        &corpus.inflections_raw_buffer_path,
        kind,
    )?;
    Ok((starts, text, raw_buffers, inflections))
}
