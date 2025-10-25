use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::inflection_data::WordInflectionData;

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "(usize, String, bool, bool)")]
pub struct StemMapValue {
    pub index: usize,
    pub lemma: String,
    pub is_verb: bool,
    pub is_stem: bool,
}

// Implementation to convert from tuple format to struct
impl From<(usize, String, bool, bool)> for StemMapValue {
    fn from(tuple: (usize, String, bool, bool)) -> Self {
        StemMapValue {
            index: tuple.0,
            lemma: tuple.1,
            is_verb: tuple.2,
            is_stem: tuple.3,
        }
    }
}

// Updated StemOrForm to match TypeScript serialization
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum StemOrForm {
    Stem(Stem),
    IrregularForm(IrregularForm),
}

// Inflection context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionContext {
    pub grammatical_data: WordInflectionData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub internal_tags: Option<Vec<String>>,
}

// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(from = "Option<String>")]
#[serde(rename_all = "lowercase")]
pub enum StemCode {
    None = 0,
    Wd = 1,
    Aj = 2,
    No = 3,
    Vb = 4,
    De = 5,
    Vs = 6,
}

// Implementation to convert from tuple format to struct
impl From<Option<String>> for StemCode {
    fn from(code: Option<String>) -> Self {
        match code.as_deref() {
            Some("wd") => StemCode::Wd,
            Some("aj") => StemCode::Aj,
            Some("no") => StemCode::No,
            Some("vb") => StemCode::Vb,
            Some("de") => StemCode::De,
            Some("vs") => StemCode::Vs,
            None => StemCode::None,
            _ => panic!("Unknown StemCode"),
        }
    }
}

impl StemCode {
    pub fn is_indeclinable(&self) -> bool {
        matches!(self, StemCode::Wd | StemCode::Vb)
    }

    pub fn is_none(&self) -> bool {
        matches!(self, StemCode::None)
    }
}

// Updated Stem: matches TS Stem which extends InflectionContext and has code, stem, inflection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stem {
    #[serde(skip_serializing_if = "StemCode::is_none")]
    pub code: StemCode,
    pub stem: String,
    pub inflection: InflectionTableKey,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// Updated IrregularForm: matches TS IrregularForm (extends InflectionContext, has optional code and form)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrregularForm {
    #[serde(skip_serializing_if = "StemCode::is_none")]
    pub code: StemCode,
    pub form: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// InflectionEnding matches TypeScript version
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionEnding {
    pub ending: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// Lemma definition
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lemma {
    pub lemma: String,
    pub stems: Option<Vec<usize>>,
    pub irregular_forms: Option<Vec<usize>>,
    // The default is false if not present.
    #[serde(default)]
    pub is_verb: bool,
}

// InflectionTable structure
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionTable {
    pub name: String,
    pub endings: Vec<InflectionEnding>,
}

// Type alias for the complex inflection lookup type
pub type InflectionLookupType = Vec<HashMap<String, Vec<InflectionEnding>>>;
pub type InflectionTableKey = u16;

// Updated CruncherTables structure to match TypeScript serialization with Maps as plain objects
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CruncherTables {
    /// Maps endings to the possible inflection paradigms associated with that ending.
    /// For example, if "a_ae" is the 3rd inflection in the `inflectionLookup` table,
    /// then "am" -> [2] would be an entry in this map.
    pub ends_map: HashMap<String, Vec<InflectionTableKey>>,
    pub stem_map: HashMap<String, Vec<StemMapValue>>,
    pub inflection_lookup: InflectionLookupType,
    pub numerals: Vec<Lemma>,
    pub raw_tables: HashMap<String, InflectionTable>,
    pub raw_lemmata: HashMap<String, Vec<Lemma>>,
    pub all_stems: Vec<Stem>,
    pub all_irregs: Vec<IrregularForm>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrunchResult {
    pub lemma: String,
    pub form: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem: Option<Stem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<InflectionEnding>,
    #[serde(skip_serializing_if = "is_false")]
    pub relaxed_case: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub relaxed_vowel_lengths: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enclitic: Option<String>,
    pub is_verb: bool,
    #[serde(flatten)]
    pub context: InflectionContext,
}

pub enum VowelLength {
    Strict,
    Relaxed,
}

pub struct CruncherOptions {
    pub vowel_length: VowelLength,
    pub relax_case: bool,
    pub relax_u_and_v: bool,
    pub relax_i_and_j: bool,
    pub handle_enclitics: bool,
    pub skip_consolidation: bool,
}

impl Default for CruncherOptions {
    fn default() -> Self {
        CruncherOptions {
            vowel_length: VowelLength::Relaxed,
            relax_case: true,
            relax_u_and_v: true,
            relax_i_and_j: true,
            handle_enclitics: true,
            skip_consolidation: true,
        }
    }
}
