use crate::common::{PackedBitMask, PackedIndexData};
use crate::corpus_serialization::LatinCorpusIndex;
use crate::packed_arrays;
use crate::packed_index_utils::{
    apply_and_to_indices, has_value_in_range, max_elements_in, unpack_packed_index_data,
    ApplyAndResult,
};
use rusqlite::{Connection, Result};
use std::path::Path;

const MAX_QUERY_PARTS: usize = 8;
const MAX_QUERY_ATOMS: usize = 8;

// Query-related structs, translated from corpus_common.ts
#[derive(Debug)]
pub struct WordQuery {
    pub word: String,
}

#[derive(Debug)]
pub struct LemmaQuery {
    pub lemma: String,
}

#[derive(Debug)]
pub struct InflectionQuery {
    pub category: String, // e.g., "case", "gender"
    pub value: String,    // e.g., "Nox", "Masc"
}

#[derive(Debug)]
pub enum CorpusQueryAtom {
    Word(WordQuery),
    Lemma(LemmaQuery),
    Inflection(InflectionQuery),
}

#[derive(Debug)]
pub struct ComposedQuery {
    pub composition: String, // "and"
    pub atoms: Vec<CorpusQueryAtom>,
}

#[derive(Debug)]
pub enum QueryToken {
    Atom(CorpusQueryAtom),
    Composed(ComposedQuery),
}

#[derive(Debug)]
pub struct CorpusQueryPart {
    pub token: QueryToken,
}

#[derive(Debug)]
pub struct CorpusQuery {
    pub parts: Vec<CorpusQueryPart>,
}

#[derive(Debug, PartialEq)]
pub struct CorpusQueryMatch {
    pub work_id: String,
    pub work_name: String,
    pub author: String,
    pub section: String,
    pub offset: u32,
    pub text: String,
    pub left_context: String,
    pub right_context: String,
}

#[derive(Debug)]
pub struct CorpusQueryResult {
    pub total_results: usize,
    pub matches: Vec<CorpusQueryMatch>,
    pub page_start: usize,
    #[expect(unused)]
    pub page_size: Option<usize>,
}

// Internal types for query processing
struct InternalQueryAtom {
    atom: CorpusQueryAtom,
    size_upper_bound: usize,
}

struct InternalComposedQuery {
    atoms: Vec<InternalQueryAtom>,
    position: usize,
}

struct IntermediateResult {
    data: PackedIndexData,
    position: i32,
}

pub struct CorpusQueryEngine {
    corpus: LatinCorpusIndex,
    token_db: Connection,
}

impl CorpusQueryEngine {
    pub fn new(corpus: LatinCorpusIndex) -> Result<Self> {
        let db_path = Path::new("../..").join(&corpus.raw_text_db);
        let token_db = Connection::open(db_path)?;
        Ok(CorpusQueryEngine { corpus, token_db })
    }

    fn get_all_matches_for(&self, part: &CorpusQueryAtom) -> Option<&PackedIndexData> {
        match part {
            CorpusQueryAtom::Word(q) => {
                self.corpus.indices.get("word")?.get(&q.word.to_lowercase())
            }
            CorpusQueryAtom::Lemma(q) => self.corpus.indices.get("lemma")?.get(&q.lemma),
            CorpusQueryAtom::Inflection(q) => self.corpus.indices.get(&q.category)?.get(&q.value),
        }
    }

    fn get_upper_size_bound_for_atom(&self, atom: &CorpusQueryAtom) -> usize {
        self.get_all_matches_for(atom)
            .map_or(0, |data| max_elements_in(data))
    }

    fn convert_query(&self, query: &CorpusQuery) -> Vec<InternalComposedQuery> {
        query
            .parts
            .iter()
            .enumerate()
            .flat_map(|(i, part)| -> Vec<InternalComposedQuery> {
                match &part.token {
                    QueryToken::Atom(atom) => {
                        let size_upper_bound = self.get_upper_size_bound_for_atom(atom);
                        vec![InternalComposedQuery {
                            atoms: vec![InternalQueryAtom {
                                atom: from_query_atom_ref(atom),
                                size_upper_bound,
                            }],
                            position: i,
                        }]
                    }
                    QueryToken::Composed(composed_query) => {
                        // Assuming composed_query.composition is "and"
                        composed_query
                            .atoms
                            .iter()
                            .map(|atom| {
                                let size_upper_bound = self.get_upper_size_bound_for_atom(atom);
                                InternalComposedQuery {
                                    atoms: vec![InternalQueryAtom {
                                        atom: from_query_atom_ref(atom),
                                        size_upper_bound,
                                    }],
                                    position: i,
                                }
                            })
                            .collect()
                    }
                }
            })
            .collect()
    }

    fn execute_initial_part(&self, part: &InternalComposedQuery) -> Option<IntermediateResult> {
        let atom_data = self.get_all_matches_for(&part.atoms[0].atom)?;
        Some(IntermediateResult {
            data: clone_packed_index_data(atom_data),
            position: part.position as i32,
        })
    }

    fn filter_candidates_on(
        &self,
        candidates: IntermediateResult,
        query_atom: &CorpusQueryAtom,
        query_part_position: usize,
    ) -> Option<IntermediateResult> {
        let filter_data = self.get_all_matches_for(query_atom)?;
        let (intersection, position) = apply_and_to_indices(
            &candidates.data,
            candidates.position,
            filter_data,
            query_part_position as i32,
        );

        Some(IntermediateResult {
            data: to_packed_index_data(intersection),
            position,
        })
    }

    fn resolve_candidates(&self, candidates: &IntermediateResult, query_length: usize) -> Vec<u32> {
        let hard_breaks = match self
            .corpus
            .indices
            .get("breaks")
            .and_then(|m| m.get("hard"))
        {
            Some(b) => b,
            None => return vec![], // No hard breaks index found
        };

        let unpacked = unpack_packed_index_data(&candidates.data);
        let mut matches: Vec<u32> = Vec::new();

        for &token_id in &unpacked {
            let true_id = (token_id as i64) - (candidates.position as i64);
            if true_id < 0 || true_id as u64 >= self.corpus.stats.total_words {
                continue;
            }

            if query_length > 1 {
                let range_end = true_id as u32 + query_length as u32 - 2;
                if has_value_in_range(hard_breaks, (true_id as u32, range_end)) {
                    continue;
                }
            }
            matches.push(true_id as u32);
        }
        matches
    }

    fn resolve_result(
        &self,
        token_id: u32,
        query_length: usize,
    ) -> Result<CorpusQueryMatch, rusqlite::Error> {
        let work_ranges = &self.corpus.work_row_ranges;
        let work_idx = work_ranges
            .binary_search_by(|(_, row_data)| {
                let work_start_token_id = row_data[0].1;
                let work_end_token_id = row_data[row_data.len() - 1].2;
                if token_id < work_start_token_id {
                    std::cmp::Ordering::Greater
                } else if token_id >= work_end_token_id {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map(|i| work_ranges[i].0 as usize)
            .unwrap_or_else(|_| panic!("TokenId {} not found in any work.", token_id));

        let row_data = &work_ranges[work_idx].1;
        let row_info = row_data
            .binary_search_by(|(_, start, end)| {
                if token_id < *start {
                    std::cmp::Ordering::Greater
                } else if token_id >= *end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .map(|i| row_data[i])
            .unwrap_or_else(|_| {
                panic!(
                    "TokenId {} not found in any row for work index {}.",
                    token_id, work_idx
                )
            });

        let (work_id, row_ids, work_data) = &self.corpus.work_lookup[work_idx];
        let row_idx = row_info.0 as usize;

        let context_len = 4;
        let start_rowid = token_id.saturating_sub(context_len);
        let limit = query_length + (context_len * 2) as usize;

        let mut stmt = self
            .token_db
            .prepare("SELECT token, break, rowid FROM raw_text WHERE rowid >= ? LIMIT ?")?;

        let mut rows = stmt.query([start_rowid, limit as u32])?;

        let mut left_context = String::new();
        let mut text = String::new();
        let mut right_context = String::new();

        while let Some(row) = rows.next()? {
            let token: String = row.get(0)?;
            let break_str: String = row.get(1)?;
            let n: u32 = row.get(2)?;

            if n < token_id {
                left_context.push_str(&token);
                left_context.push_str(&break_str);
                continue;
            }
            if n < token_id + query_length as u32 {
                text.push_str(&token);
                if n < token_id + query_length as u32 - 1 {
                    text.push_str(&break_str);
                } else {
                    right_context.push_str(&break_str);
                }
                continue;
            }
            right_context.push_str(&token);
            right_context.push_str(&break_str);
        }

        Ok(CorpusQueryMatch {
            work_id: work_id.clone(),
            work_name: work_data.name.clone(),
            author: work_data.author.clone(),
            section: row_ids[row_idx].join("."),
            offset: token_id - row_info.1,
            text,
            left_context,
            right_context,
        })
    }

    pub fn query_corpus(
        &self,
        query: &CorpusQuery,
        page_start: usize,
        page_size: Option<usize>,
    ) -> Result<CorpusQueryResult> {
        if query.parts.is_empty() {
            return Ok(empty_result());
        }
        // check_query_complexity(query);

        let mut sorted_query = self.convert_query(query);
        sorted_query.sort_by_key(|p| p.atoms[0].size_upper_bound);

        let mut candidates = match self.execute_initial_part(&sorted_query[0]) {
            Some(c) => c,
            None => return Ok(empty_result()),
        };

        for part in sorted_query.iter().skip(1) {
            candidates =
                match self.filter_candidates_on(candidates, &part.atoms[0].atom, part.position) {
                    Some(c) => c,
                    None => return Ok(empty_result()),
                };
        }

        let match_ids = self.resolve_candidates(&candidates, query.parts.len());
        let total_results = match_ids.len();

        let page_size_val = page_size.unwrap_or(total_results);
        let end = (page_start + page_size_val).min(total_results);

        let matches = if page_start < total_results {
            match_ids[page_start..end]
                .iter()
                .map(|&id| self.resolve_result(id, query.parts.len()))
                .collect::<Result<Vec<_>, _>>()?
        } else {
            vec![]
        };

        Ok(CorpusQueryResult {
            total_results,
            matches,
            page_start,
            page_size,
        })
    }
}

fn empty_result() -> CorpusQueryResult {
    CorpusQueryResult {
        total_results: 0,
        matches: vec![],
        page_start: 0,
        page_size: None,
    }
}

// Helper to convert query atom reference to an owned version for storing in InternalQueryAtom
fn from_query_atom_ref(atom: &CorpusQueryAtom) -> CorpusQueryAtom {
    match atom {
        CorpusQueryAtom::Word(q) => CorpusQueryAtom::Word(WordQuery {
            word: q.word.clone(),
        }),
        CorpusQueryAtom::Lemma(q) => CorpusQueryAtom::Lemma(LemmaQuery {
            lemma: q.lemma.clone(),
        }),
        CorpusQueryAtom::Inflection(q) => CorpusQueryAtom::Inflection(InflectionQuery {
            category: q.category.clone(),
            value: q.value.clone(),
        }),
    }
}

// Helper to convert ApplyAndResult to PackedIndexData
fn to_packed_index_data(result: ApplyAndResult) -> PackedIndexData {
    match result {
        ApplyAndResult::Array(arr) => {
            PackedIndexData::PackedNumbers(packed_arrays::pack_sorted_nats(&arr))
        }
        ApplyAndResult::Bitmask(bm) => PackedIndexData::PackedBitMask(bm),
    }
}

// Helper to clone PackedIndexData
fn clone_packed_index_data(data: &PackedIndexData) -> PackedIndexData {
    match data {
        PackedIndexData::PackedNumbers(d) => PackedIndexData::PackedNumbers(d.clone()),
        PackedIndexData::PackedBitMask(bm) => PackedIndexData::PackedBitMask(PackedBitMask {
            format: bm.format.clone(),
            data: bm.data.clone(),
            num_set: bm.num_set,
        }),
    }
}
