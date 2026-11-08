use memmap2::{Mmap, MmapOptions};
use std::{error::Error, fs::File};

pub trait RawByteReader {
    fn bytes(&self, i: usize, j: usize) -> &[u8];
    fn advise_range(&self, _start: usize, _end: usize) {}
}

struct MmapReader {
    mmap: Mmap,
}

/// An in-memory buffer (8-byte aligned when made by `byte_reader_from_vec`).
struct OwnedBytes(Vec<u8>);

/// An in-memory copy of a buffer, made 8-byte aligned.
struct AlignedBuffer {
    words: Vec<u64>,
    len: usize,
}

impl MmapReader {
    fn new(path: &str, pre_populate: bool) -> Result<Self, Box<dyn Error>> {
        let file = File::open(path)?;
        let mmap = unsafe {
            if pre_populate {
                MmapOptions::new().populate().map(&file)?
            } else {
                Mmap::map(&file)?
            }
        };
        Ok(MmapReader { mmap })
    }
}

impl RawByteReader for MmapReader {
    #[inline(always)]
    fn bytes(&self, i: usize, j: usize) -> &[u8] {
        &self.mmap[i..j]
    }

    fn advise_range(&self, start: usize, end: usize) {
        if start >= end {
            return;
        }
        unsafe {
            let ptr = self.mmap.as_ptr().add(start) as *mut libc::c_void;
            let len = end - start;
            libc::madvise(ptr, len, libc::MADV_WILLNEED);
        }
    }
}

impl RawByteReader for OwnedBytes {
    #[inline(always)]
    fn bytes(&self, i: usize, j: usize) -> &[u8] {
        &self.0[i..j]
    }
}

impl AlignedBuffer {
    fn new(bytes: &[u8]) -> Self {
        let words = bytes
            .chunks(8)
            .map(|chunk| {
                let mut word = [0u8; 8];
                word[..chunk.len()].copy_from_slice(chunk);
                u64::from_ne_bytes(word)
            })
            .collect();
        AlignedBuffer {
            words,
            len: bytes.len(),
        }
    }
}

impl RawByteReader for AlignedBuffer {
    #[inline(always)]
    fn bytes(&self, i: usize, j: usize) -> &[u8] {
        // SAFETY: the `u64`s are initialized and padding-free, `u8` has
        // alignment 1, and the slice covers exactly the vector's elements.
        let all = unsafe {
            std::slice::from_raw_parts(self.words.as_ptr().cast::<u8>(), 8 * self.words.len())
        };
        &all[..self.len][i..j]
    }
}

/// A reader over a copy of `bytes` that is 8-byte aligned.
pub(crate) fn aligned_copy(bytes: &[u8]) -> Box<dyn RawByteReader> {
    Box::new(AlignedBuffer::new(bytes))
}

/// A reader over `bytes` that is 8-byte aligned (so `u32` and `u64` arrays in
/// it can be reinterpreted in place), copying only if `bytes` is not.
pub fn byte_reader_from_vec(bytes: Vec<u8>) -> Box<dyn RawByteReader> {
    if bytes.as_ptr().cast::<u64>().is_aligned() {
        Box::new(OwnedBytes(bytes))
    } else {
        aligned_copy(&bytes)
    }
}

#[derive(PartialEq, Eq, Clone, Copy)]
pub enum ReaderKind {
    Mmap,
    MmapPopulated,
    InMemory,
}

pub fn byte_reader(kind: ReaderKind, path: &str) -> Result<Box<dyn RawByteReader>, Box<dyn Error>> {
    match kind {
        ReaderKind::Mmap => Ok(Box::new(MmapReader::new(path, false)?)),
        ReaderKind::MmapPopulated => Ok(Box::new(MmapReader::new(path, true)?)),
        ReaderKind::InMemory => Ok(byte_reader_from_vec(std::fs::read(path)?)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readers_from_vec_are_aligned_and_exact() {
        let bytes: Vec<u8> = (0..19).collect();
        for reader in [byte_reader_from_vec(bytes.clone()), aligned_copy(&bytes)] {
            assert_eq!(reader.bytes(0, 19), &bytes[..]);
            assert_eq!(reader.bytes(3, 7), &bytes[3..7]);
            assert!(reader.bytes(0, 0).as_ptr().cast::<u64>().is_aligned());
        }
        // An unaligned source still gives an aligned, identical copy.
        let reader = aligned_copy(&bytes[1..]);
        assert_eq!(reader.bytes(0, 18), &bytes[1..]);
        assert!(reader.bytes(0, 0).as_ptr().cast::<u64>().is_aligned());
    }
}
