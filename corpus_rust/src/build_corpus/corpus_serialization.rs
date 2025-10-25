use std::{
    cell::RefCell,
    collections::HashMap,
    fs::{self, File},
    io::Write,
    path::Path,
};

use serde::{Serialize, Serializer};

use crate::{
    build_corpus::{
        CORPUS_AUTHORS_LIST, CORPUS_BUFFERS, CORPUS_FILE, CORPUS_TOKEN_STARTS,
        InProgressLatinCorpus,
    },
    corpus_index::StoredMapValue,
};

fn write_authors_file(
    _corpus: &InProgressLatinCorpus,
    corpus_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let _authors_path = Path::new(corpus_dir).join(CORPUS_AUTHORS_LIST);
    // TODO: UNFINISHED STUB
    //  const encoded = encodeMessage(
    //     serverMessage(Object.keys(corpus.authorLookup))
    //   );
    //   const compressed = zlib.gzipSync(Buffer.from(encoded, "utf8"), {
    //     level: 9,
    //   });
    // let authors: Vec<String> = corpus.author_lookup.keys().cloned().collect();
    // let authors_json = serde_json::to_string_pretty(&authors)?;
    // fs::write(authors_path, authors_json)?;
    Ok(())
}

/// Write token starts and break starts to a binary file
///
/// This function writes the token starts and break starts arrays from the corpus
/// to a binary file, and updates the corpus to remove the in-memory data and add
/// a path to the file. The file format is a sequence of u32 pairs, where each pair
/// consists of a token start followed by a break start.
fn write_token_starts(
    corpus: &mut InProgressLatinCorpus,
    corpus_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let dest_file = Path::new(corpus_dir).join(CORPUS_TOKEN_STARTS);
    let num_tokens = corpus.num_tokens;
    let token_starts = &corpus.token_starts;
    let break_starts = &corpus.break_starts;

    // Create a buffer with alternating token starts and break starts
    let mut buffer = Vec::with_capacity(num_tokens * 2);
    for i in 0..num_tokens {
        buffer.push(token_starts[i]);
        buffer.push(break_starts[i]);
    }

    // Write the buffer to the file
    let bytes = buffer
        .iter()
        .flat_map(|&n| n.to_ne_bytes())
        .collect::<Vec<u8>>();
    fs::write(&dest_file, bytes)?;

    // Update corpus to remove in-memory data and add file path
    corpus.token_starts = Vec::new();
    corpus.break_starts = Vec::new();
    corpus.token_starts_path = dest_file.to_string_lossy().to_string();

    Ok(())
}

/// Converts a vector of indices to a bitmask representation
fn to_bit_mask(indices: &[u32], num_tokens: usize) -> Vec<u64> {
    let num_words = (num_tokens + 63) / 64;
    let mut mask = vec![0u64; num_words];
    for &index in indices {
        let word_index = (index as usize) / 64;
        let bit_index = (index as usize) % 64;
        if word_index < num_words {
            mask[word_index] |= 1u64 << bit_index;
        }
    }
    mask
}

/// Prepares an index map for serialization by writing data to the buffer file
fn prepare_index_map(
    index_map: &HashMap<String, Vec<u32>>,
    num_tokens: usize,
    outer_key: &str,
    writer: &mut File,
    offset: usize,
) -> Result<(HashMap<String, StoredMapValue>, usize), Box<dyn std::error::Error>> {
    let mut new_offset = offset;
    let mut entries = HashMap::new();

    for (key, value) in index_map.iter() {
        let use_bit_mask =
            value.len() * 32 > num_tokens || (outer_key == "breaks" && key == "hard");

        // Bitmasks are interpreted as a vector of 64 bit integers.
        // To avoid having to handle misaligned data, make sure it's 64-bit aligned.
        if use_bit_mask {
            let alignment = 8;
            let padding = (alignment - (new_offset % alignment)) % alignment;
            if padding > 0 {
                writer.write_all(&vec![0u8; padding])?;
                new_offset += padding;
            }
        }

        let index_bytes = if use_bit_mask {
            let bit_mask = to_bit_mask(value, num_tokens);
            bit_mask
                .iter()
                .flat_map(|&n| n.to_ne_bytes())
                .collect::<Vec<u8>>()
        } else {
            value
                .iter()
                .flat_map(|&n| n.to_ne_bytes())
                .collect::<Vec<u8>>()
        };

        let index_len = index_bytes.len();
        let stored_value = if use_bit_mask {
            StoredMapValue::BitMask {
                offset: new_offset as u32,
                num_set: value.len() as u32,
            }
        } else {
            StoredMapValue::Packed {
                offset: new_offset as u32,
                len: value.len() as u32,
            }
        };

        writer.write_all(&index_bytes)?;
        new_offset += index_len;
        entries.insert(key.clone(), stored_value);
    }

    Ok((entries, new_offset))
}

/// Context for serialization that tracks the buffer writer and offset
struct SerializationContext {
    writer: RefCell<File>,
    offset: RefCell<usize>,
    num_tokens: usize,
}

impl SerializationContext {
    fn new(writer: File, num_tokens: usize) -> Self {
        Self {
            writer: RefCell::new(writer),
            offset: RefCell::new(4), // Start after the num_tokens u32
            num_tokens,
        }
    }

    fn prepare_index_map(
        &self,
        index_map: &HashMap<String, Vec<u32>>,
        outer_key: &str,
    ) -> Result<HashMap<String, StoredMapValue>, Box<dyn std::error::Error>> {
        let mut writer = self.writer.borrow_mut();
        let mut offset = self.offset.borrow_mut();
        let (entries, new_offset) =
            prepare_index_map(index_map, self.num_tokens, outer_key, &mut *writer, *offset)?;
        *offset = new_offset;
        Ok(entries)
    }
}

/// Wrapper for serializing index maps
struct IndexMapSerializer<'a> {
    map: &'a HashMap<String, Vec<u32>>,
    context: &'a SerializationContext,
    outer_key: &'a str,
}

impl<'a> Serialize for IndexMapSerializer<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let entries = self
            .context
            .prepare_index_map(self.map, self.outer_key)
            .map_err(serde::ser::Error::custom)?;
        entries.serialize(serializer)
    }
}

/// Serializable wrapper for InProgressLatinCorpus
struct SerializableCorpus<'a> {
    corpus: &'a InProgressLatinCorpus,
    context: &'a SerializationContext,
}

impl<'a> Serialize for SerializableCorpus<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("InProgressLatinCorpus", 10)?;

        state.serialize_field("numTokens", &self.corpus.num_tokens)?;
        state.serialize_field("tokenStartsPath", &self.corpus.token_starts_path)?;
        state.serialize_field("rawBufferPath", &self.corpus.raw_buffer_path)?;
        state.serialize_field("rawText", &self.corpus.raw_text)?;
        state.serialize_field("authorLookup", &self.corpus.author_lookup)?;

        // Serialize index maps with custom serialization
        if let Some(ref words) = self.corpus.words {
            let wrapper = IndexMapSerializer {
                map: words,
                context: self.context,
                outer_key: "words",
            };
            state.serialize_field("words", &wrapper)?;
        } else {
            state.skip_field("words")?;
        }

        if let ref breaks = self.corpus.indices.breaks {
            let wrapper = IndexMapSerializer {
                map: breaks,
                context: self.context,
                outer_key: "breaks",
            };
            state.serialize_field("breaks", &wrapper)?;
        } else {
            state.skip_field("breaks")?;
        }

        if let Some(ref authors) = self.corpus.authors {
            let wrapper = IndexMapSerializer {
                map: authors,
                context: self.context,
                outer_key: "authors",
            };
            state.serialize_field("authors", &wrapper)?;
        } else {
            state.skip_field("authors")?;
        }

        if let Some(ref works) = self.corpus.works {
            let wrapper = IndexMapSerializer {
                map: works,
                context: self.context,
                outer_key: "works",
            };
            state.serialize_field("works", &wrapper)?;
        } else {
            state.skip_field("works")?;
        }

        if let Some(ref inflections) = self.corpus.inflections {
            let wrapper = IndexMapSerializer {
                map: inflections,
                context: self.context,
                outer_key: "inflections",
            };
            state.serialize_field("inflections", &wrapper)?;
        } else {
            state.skip_field("inflections")?;
        }

        state.end()
    }
}

/// Serializes the corpus to JSON while writing buffer data to a separate file
fn serialize_corpus(
    corpus: &mut InProgressLatinCorpus,
    corpus_dir: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    write_token_starts(corpus, corpus_dir)?;

    let raw_dest_file = Path::new(corpus_dir).join(CORPUS_BUFFERS);
    corpus.raw_buffer_path = raw_dest_file.to_string_lossy().to_string();

    if raw_dest_file.exists() {
        fs::remove_file(&raw_dest_file)?;
    }

    let mut raw_write_stream = File::create(&raw_dest_file)?;

    let num_tokens = corpus.num_tokens;
    if num_tokens > u32::MAX as usize {
        return Err(format!(
            "corpus.num_tokens must fit in an unsigned 32-bit integer: {}",
            num_tokens
        )
        .into());
    }

    // Write the number of tokens as the first 4 bytes
    raw_write_stream.write_all(&(num_tokens as u32).to_ne_bytes())?;

    let context = SerializationContext::new(raw_write_stream, num_tokens);

    let wrapper = SerializableCorpus {
        corpus,
        context: &context,
    };

    let json_data = serde_json::to_string_pretty(&wrapper)?;

    Ok(json_data)
}

pub(super) fn write_corpus(
    corpus: &mut InProgressLatinCorpus,
    corpus_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if !Path::new(corpus_dir).exists() {
        fs::create_dir_all(corpus_dir)?;
    }

    write_authors_file(corpus, corpus_dir)?;

    let corpus_path = Path::new(corpus_dir).join(CORPUS_FILE);
    let serialized = serialize_corpus(corpus, corpus_dir)?;
    fs::write(&corpus_path, serialized)?;

    println!("Corpus written to {}", corpus_path.to_string_lossy());

    Ok(())
}
