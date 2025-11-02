use crate::{
    completions::{AutocompleteError, Autocompleter, string_utils::normalize_key},
    indices::{CruncherTables, InflectionEnding, Lemma, Stem},
};

type SortedEndings<'a> = Vec<(String, &'a InflectionEnding)>;

pub(super) struct Addenda<'a> {
    end_tables: Vec<SortedEndings<'a>>,
    pub(super) stem_to_lemma: Vec<u16>,
    pub(super) irreg_to_lemma: Vec<u16>,
}

impl<'t, 'o> Autocompleter<'t, 'o> {
    pub(super) fn make_addenda(
        tables: &'t CruncherTables,
    ) -> Result<Addenda<'t>, AutocompleteError> {
        // Reserve the max for "no lemma";
        if tables.raw_lemmata.len() + 1 >= u16::MAX as usize {
            return Err("Too many lemmata in CruncherTables".to_string());
        }
        let mut stem_to_lemma = vec![u16::MAX; tables.all_stems.len()];
        let mut irreg_to_lemma = vec![u16::MAX; tables.all_irregs.len()];
        for (i, lemma) in tables.raw_lemmata.iter().enumerate() {
            if let Some(stems) = &lemma.stems {
                for stem_idx in stems {
                    stem_to_lemma[*stem_idx as usize] = i as u16;
                }
            }
            if let Some(irregs) = &lemma.irregular_forms {
                for irreg_idx in irregs {
                    irreg_to_lemma[*irreg_idx as usize] = i as u16;
                }
            }
        }

        let mut end_tables = vec![];
        for grouped_table in &tables.inflection_lookup {
            let mut ends = grouped_table
                .values()
                .flatten()
                .map(|e| (normalize_key(&e.ending), e))
                .collect::<Vec<_>>();
            // `sort_unstable_by` would be slightly faster, but we want to be deterministic.
            ends.sort_by(|a, b| a.0.cmp(&b.0));
            end_tables.push(ends);
        }

        Ok(Addenda {
            end_tables,
            stem_to_lemma,
            irreg_to_lemma,
        })
    }

    pub(super) fn ends_for(&self, stem: &Stem) -> Result<&SortedEndings<'t>, AutocompleteError> {
        self.addenda
            .end_tables
            .get(stem.inflection as usize)
            .ok_or("Invalid inflection index".to_string())
    }

    pub(super) fn lemma_from_id(&self, lemma_id: u16) -> Result<&'t Lemma, AutocompleteError> {
        self.tables
            .raw_lemmata
            .get(lemma_id as usize)
            .ok_or("Invalid lemma index".to_string())
    }
}
