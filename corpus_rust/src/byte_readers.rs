use memmap2::{Mmap, MmapOptions};
use std::{error::Error, fs::File, io::Read};

pub trait RawByteReader {
    fn bytes(&self, i: usize, j: usize) -> &[u8];
    fn advise_range(&self, _start: usize, _end: usize) {}
}

struct MmapReader {
    mmap: Mmap,
}

struct InMemoryReader {
    buffer: Vec<u8>,
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

impl InMemoryReader {
    fn new(path: &str) -> Result<Self, Box<dyn Error>> {
        let mut file = File::open(path)?;
        let mut buffer = vec![];
        file.read_to_end(&mut buffer)?;
        Ok(InMemoryReader { buffer })
    }
}

impl RawByteReader for InMemoryReader {
    #[inline(always)]
    fn bytes(&self, i: usize, j: usize) -> &[u8] {
        &self.buffer[i..j]
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
        ReaderKind::InMemory => Ok(Box::new(InMemoryReader::new(path)?)),
    }
}
