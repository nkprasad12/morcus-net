use memmap2::Mmap;
use std::{error::Error, fs::File, io::Read};

pub trait RawByteReader {
    fn new(path: &str) -> Result<Self, Box<dyn Error>>
    where
        Self: Sized;
    fn bytes(&self, i: usize, j: usize) -> &[u8];
    fn advise_range(&self, _start: usize, _end: usize) {}
}

pub struct MmapReader {
    mmap: Mmap,
}

pub struct InMemoryReader {
    buffer: Vec<u8>,
}

impl RawByteReader for MmapReader {
    fn new(path: &str) -> Result<Self, Box<dyn Error>> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        Ok(MmapReader { mmap })
    }

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

impl RawByteReader for InMemoryReader {
    fn new(path: &str) -> Result<Self, Box<dyn Error>> {
        let mut file = File::open(path)?;
        let mut buffer = vec![];
        file.read_to_end(&mut buffer)?;
        Ok(InMemoryReader { buffer })
    }

    #[inline(always)]
    fn bytes(&self, i: usize, j: usize) -> &[u8] {
        &self.buffer[i..j]
    }
}
